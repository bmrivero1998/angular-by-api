
import { Component, Input } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,
  imports: [],
  template: `<div [innerHTML]="htmlContent"></div>`,
  styleUrls: ['./dynamic-viewer.component.css']
})
export class DynamicViewerComponent {
  @Input() htmlContent: SafeHtml | null = null;
}