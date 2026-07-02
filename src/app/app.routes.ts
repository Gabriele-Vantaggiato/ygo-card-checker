import { Routes } from '@angular/router';
import { CheckerPage } from './pages/checker/checker.page';

export const routes: Routes = [
  {
    path: '',
    component: CheckerPage,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
