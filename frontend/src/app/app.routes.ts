import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'editor',
    loadComponent: () => import('./features/editor/editor').then((m) => m.Editor),
  },
  {
    path: '',
    redirectTo: 'editor',
    pathMatch: 'full',
  },
];
