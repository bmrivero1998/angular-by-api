// src/app/components/dynamic-viewer/dynamic-viewer.component.ts
import { Component, Input } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  imports: [],
  template: `<div [innerHTML]="trustedHtmlContent"></div>`,
  styleUrls: ['./dynamic-viewer.component.css']
})
export class DynamicViewerComponent {
  @Input() trustedHtmlContent: SafeHtml | null = null;
}