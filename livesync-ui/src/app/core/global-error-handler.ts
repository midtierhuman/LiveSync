import { ErrorHandler, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('🚨 [LiveSync Universal Error Boundary Caught Exception]:', error);

    // Suppress non-critical ResizeObserver and websocket disconnection messages
    if (
      message.includes('ResizeObserver loop') ||
      message.includes('WebSocket is already in CLOSING or CLOSED state')
    ) {
      return;
    }
  }
}
