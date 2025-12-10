import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideMonacoEditor({
      baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/',
    }),
  ],
};
