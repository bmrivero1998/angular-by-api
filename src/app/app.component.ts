import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ApiDrivenContent,
  DynamicClickPayload,
} from './interfaces/DynamicContent.interface';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DynamicViewerComponent } from './components/dynamic-viewer/dynamic-viewer.component';
import { CommonModule } from '@angular/common';
import { DynamicContentService } from './services/dynamic-content.service';
import { FormGroup } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { LoaderComponent } from './components/loader/loader.component';

export interface DisplayableInAppComponent extends ApiDrivenContent {
  // Hereda de ApiDrivenContent
  safeHtml: SafeHtml;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, LoaderComponent], // DynamicViewerComponent importado aquí
  templateUrl: './app.component.html', // Ver abajo
  styleUrl: './app.component.css',
})
export class AppComponent {}
