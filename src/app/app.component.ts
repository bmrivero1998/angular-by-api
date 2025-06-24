import { SafeHtml } from '@angular/platform-browser';
import { ApiDrivenContent } from './interfaces/DynamicContent.interface';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { LoaderComponent } from './components/loader/loader.component';
import { ToastContainerComponent } from './components/toast-container/toast-container.component';

export interface DisplayableInAppComponent extends ApiDrivenContent {
  // Hereda de ApiDrivenContent
  safeHtml: SafeHtml;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    LoaderComponent,
    ToastContainerComponent,
  ], // DynamicViewerComponent importado aquí
  templateUrl: './app.component.html', // Ver abajo
  styleUrl: './app.component.css',
})
export class AppComponent {}
