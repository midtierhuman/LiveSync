import { Injectable, signal, inject, DestroyRef } from '@angular/core';

export interface OperationPayload {
  type: string;
  position: number;
  text: string;
  clientRevision: number;
  serverRevision: number;
}

export interface DocumentRevisionSnapshot {
  revision: number;
  content: string;
  timestamp: string;
  changeDescription: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  lineNumber: number;
}

@Injectable({
  providedIn: 'root',
})
export class TimeTravelService {
  readonly isTimeTravelActive = signal<boolean>(false);
  readonly isPlaying = signal<boolean>(false);
  readonly playbackSpeed = signal<number>(1); // 1x, 2x, 5x
  readonly currentRevisionIndex = signal<number>(0);
  readonly totalRevisions = signal<number>(0);
  readonly snapshots = signal<DocumentRevisionSnapshot[]>([]);
  readonly currentSnapshotContent = signal<string>('');
  readonly diffLines = signal<DiffLine[]>([]);

  private playTimer: ReturnType<typeof setInterval> | null = null;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.exitSession();
    });
  }

  startSession(fullContent: string, operations: OperationPayload[] = []) {
    this.stopPlayback();
    this.isTimeTravelActive.set(true);

    const generatedSnapshots = this.buildSnapshotsFromContent(fullContent, operations);
    this.snapshots.set(generatedSnapshots);
    this.totalRevisions.set(generatedSnapshots.length);

    // Default seek to latest snapshot
    const initialIndex = generatedSnapshots.length > 0 ? generatedSnapshots.length - 1 : 0;
    this.seekTo(initialIndex);
  }

  exitSession() {
    this.stopPlayback();
    this.isTimeTravelActive.set(false);
    this.snapshots.set([]);
    this.totalRevisions.set(0);
    this.currentRevisionIndex.set(0);
    this.diffLines.set([]);
  }

  seekTo(index: number) {
    const snaps = this.snapshots();
    if (index < 0 || index >= snaps.length) return;

    this.currentRevisionIndex.set(index);
    const currentSnap = snaps[index];
    this.currentSnapshotContent.set(currentSnap.content);

    // Compute diff against previous snapshot
    const prevContent = index > 0 ? snaps[index - 1].content : '';
    const diff = this.computeLineDiff(prevContent, currentSnap.content);
    this.diffLines.set(diff);
  }

  togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);

    const intervalMs = Math.max(100, Math.round(1000 / this.playbackSpeed()));
    this.playTimer = setInterval(() => {
      const nextIdx = this.currentRevisionIndex() + 1;
      if (nextIdx >= this.totalRevisions()) {
        this.pause();
      } else {
        this.seekTo(nextIdx);
      }
    }, intervalMs);
  }

  pause() {
    this.stopPlayback();
    this.isPlaying.set(false);
  }

  setSpeed(speed: number) {
    this.playbackSpeed.set(speed);
    if (this.isPlaying()) {
      this.pause();
      this.play();
    }
  }

  stepForward() {
    this.pause();
    this.seekTo(this.currentRevisionIndex() + 1);
  }

  stepBackward() {
    this.pause();
    this.seekTo(this.currentRevisionIndex() - 1);
  }

  private stopPlayback() {
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  private buildSnapshotsFromContent(
    fullContent: string,
    operations: OperationPayload[],
  ): DocumentRevisionSnapshot[] {
    const list: DocumentRevisionSnapshot[] = [
      {
        revision: 0,
        content: '',
        timestamp: 'Rev 0 (Initial)',
        changeDescription: 'Initial document creation',
      },
    ];

    if (!operations || operations.length === 0) {
      // Create synthetic progressive snapshots capped at 30 to prevent memory bloat
      const lines = fullContent.split('\n');
      const maxSnapshots = 30;
      const step = Math.max(1, Math.floor(lines.length / maxSnapshots));
      
      let progressive = '';
      let revCount = 1;
      for (let i = 0; i < lines.length; i++) {
        progressive += (i === 0 ? '' : '\n') + lines[i];
        if (i % step === 0 || i === lines.length - 1) {
          list.push({
            revision: revCount++,
            content: progressive,
            timestamp: `Rev ${revCount - 1}`,
            changeDescription: `Line ${i + 1}: "${lines[i].substring(0, 30)}"`,
          });
        }
      }
      return list;
    }

    // Reconstruct step by step if operation log is available (capped at last 30)
    let currentDoc = '';
    const maxOps = 30;
    const opsToProcess = operations.length > maxOps ? operations.slice(operations.length - maxOps) : operations;
    
    opsToProcess.forEach((op, idx) => {
      if (op.type === 'insert') {
        currentDoc = currentDoc.slice(0, op.position) + op.text + currentDoc.slice(op.position);
      } else if (op.type === 'delete') {
        currentDoc =
          currentDoc.slice(0, op.position) + currentDoc.slice(op.position + op.text.length);
      }
      list.push({
        revision: op.serverRevision || idx + 1,
        content: currentDoc,
        timestamp: `Rev ${op.serverRevision || idx + 1}`,
        changeDescription: `${op.type.toUpperCase()} at pos ${op.position}: "${op.text.substring(0, 20)}"`,
      });
    });

    return list;
  }

  private computeLineDiff(prevContent: string, currentContent: string): DiffLine[] {
    const prevLines = prevContent.split('\n');
    const currLines = currentContent.split('\n');
    const diff: DiffLine[] = [];

    let i = 0;
    let j = 0;

    while (i < prevLines.length || j < currLines.length) {
      if (i < prevLines.length && j < currLines.length && prevLines[i] === currLines[j]) {
        diff.push({ type: 'unchanged', text: currLines[j], lineNumber: j + 1 });
        i++;
        j++;
      } else if (j < currLines.length && (!prevLines.includes(currLines[j]) || i >= prevLines.length)) {
        diff.push({ type: 'added', text: currLines[j], lineNumber: j + 1 });
        j++;
      } else if (i < prevLines.length) {
        diff.push({ type: 'removed', text: prevLines[i], lineNumber: i + 1 });
        i++;
      } else {
        j++;
      }
    }

    return diff;
  }
}
