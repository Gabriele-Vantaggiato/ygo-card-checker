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
    ],
  },
  { path: '**', redirectTo: '' },
];
