import { Routes } from '@angular/router';
import { AppShellComponent } from './core/layout/app-shell.component';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/checker/pages/checker.page').then((m) => m.CheckerPage),
      },
      {
        path: 'combo',
        loadComponent: () => import('./features/combo/pages/combo.page').then((m) => m.ComboPage),
      },
      {
        path: 'decklist',
        loadComponent: () =>
          import('./features/decklist/pages/decklist.page').then((m) => m.DecklistPage),
      },
      {
        path: 'auth/callback',
        loadComponent: () =>
          import('./features/auth/pages/auth-callback.page').then((m) => m.AuthCallbackPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/pages/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'community',
        loadComponent: () =>
          import('./features/community/pages/explore.page').then((m) => m.ExplorePage),
      },
      {
        path: 'community/u/:handle',
        loadComponent: () =>
          import('./features/community/pages/public-profile.page').then((m) => m.PublicProfilePage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
