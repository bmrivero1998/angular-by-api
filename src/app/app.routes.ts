import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { PaginaPrincipalComponent } from './components/pagina-principal/pagina-principal.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'principal', component: PaginaPrincipalComponent },
  // Redirige al login si la ruta está vacía
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  // Una ruta "wildcard" para manejar páginas no encontradas (opcional)
  { path: '**', redirectTo: '/login' },
];
