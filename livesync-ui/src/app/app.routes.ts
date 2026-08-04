import { Routes } from '@angular/router';
import { authGuard, publicGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
    canActivate: [publicGuard],
  },
  {
    path: 'signin',
    loadComponent: () => import('./features/auth/signin').then((m) => m.SignIn),
    canActivate: [publicGuard],
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup').then((m) => m.SignUp),
    canActivate: [publicGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
    canActivate: [authGuard],
  },
  {
    path: 'editor/:id',
    loadComponent: () => import('./features/editor/editor').then((m) => m.Editor),
    canActivate: [authGuard],
  },
  {
    path: 'add-shared',
    loadComponent: () =>
      import('./features/dashboard/add-shared/add-shared').then((m) => m.AddShared),
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
