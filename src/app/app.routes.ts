import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell.component';
import { CheckerPage } from './pages/checker/checker.page';
import { DecklistPage } from './pages/decklist/decklist.page';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', component: CheckerPage },
      { path: 'decklist', component: DecklistPage },
    ],
  },
  { path: '**', redirectTo: '' },
];
