import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AppShellComponent } from './core/layout/app-shell.component';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [
          (route) =>
            route.queryParamMap.has('cardId')
              ? inject(Router).createUrlTree(['/search'], { queryParams: route.queryParams })
              : true,
        ],
        loadComponent: () =>
          import('./features/landing/pages/landing.page').then((m) => m.LandingPage),
      },
      {
        path: 'search',
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
        path: 'overlay',
        loadComponent: () =>
          import('./features/overlay/pages/overlay.page').then((m) => m.OverlayPage),
      },
      {
        path: 'flow',
        loadComponent: () =>
          import('./features/ygo-flow/pages/ygo-flow.page').then((m) => m.YgoFlowPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
