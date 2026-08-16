import { StateEffect, StateField, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { CollaboratorCursor } from '../../services/realtime.service';

export const setRemoteCursorsEffect = StateEffect.define<CollaboratorCursor[]>();

class RemoteCursorWidget extends WidgetType {
  constructor(
    private readonly userName: string,
    private readonly color: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-remote-cursor-container';
    wrap.style.setProperty('--cursor-color', this.color);

    const caret = document.createElement('span');
    caret.className = 'cm-remote-caret';
    caret.style.borderColor = this.color;

    const label = document.createElement('span');
    label.className = 'cm-remote-cursor-label';
    label.style.backgroundColor = this.color;
    label.textContent = this.userName;

    wrap.appendChild(caret);
    wrap.appendChild(label);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  override eq(other: RemoteCursorWidget): boolean {
    return other.userName === this.userName && other.color === this.color;
  }
}

export const remotePresenceField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRemoteCursorsEffect)) {
        const cursors = effect.value;
        const widgets: Range<Decoration>[] = [];
        const docLength = tr.newDoc.length;

        for (const c of cursors) {
          const pos = Math.max(0, Math.min(c.position, docLength));
          const selStart = c.selectionStart ?? pos;
          const selEnd = c.selectionEnd ?? pos;

          // 1. Multi-User Range Selection Highlighting
          if (selStart !== selEnd) {
            const from = Math.max(0, Math.min(Math.min(selStart, selEnd), docLength));
            const to = Math.max(0, Math.min(Math.max(selStart, selEnd), docLength));
            if (from < to) {
              widgets.push(
                Decoration.mark({
                  attributes: {
                    style: `background-color: ${c.color}35; border-radius: 2px; box-shadow: inset 0 0 0 1px ${c.color}60;`,
                  },
                  class: 'cm-remote-selection-mark',
                }).range(from, to)
              );
            }
          }

          // 2. Remote Cursor Caret & Name Tag Widget
          widgets.push(
            Decoration.widget({
              widget: new RemoteCursorWidget(c.userName || 'Collaborator', c.color),
              side: 1,
            }).range(pos)
          );
        }

        // Sort decorations by range start position (required by CodeMirror 6)
        widgets.sort((a, b) => a.from - b.from || (a.value.startSide || 0) - (b.value.startSide || 0));
        return Decoration.set(widgets, true);
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
