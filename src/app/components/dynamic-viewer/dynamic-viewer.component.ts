import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-dynamic-viewer',
  standalone: true,  imports: [ CommonModule],
  templateUrl: './dynamic-viewer.component.html',
  styleUrl: './dynamic-viewer.component.css',
})
export class DynamicViewerComponent<T> implements OnChanges {

  @Input() htmlContent: string = '';
  @Input() formGroup: FormGroup | null = null;

  public sanitizedHtmlToShow: SafeHtml | null = null;

  constructor(private sanitizer: DomSanitizer) {} 

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['htmlContent']) { 
      if (this.htmlContent) {
        this.sanitizedHtmlToShow = this.sanitizer.bypassSecurityTrustHtml(this.htmlContent);
        console.log('DynamicViewer: htmlContent recibido:', this.htmlContent.substring(0,100)); // Muestra una parte
        console.log('DynamicViewer: sanitizedHtmlToShow establecido.');
      } else {
        this.sanitizedHtmlToShow = null; // Limpia si no hay contenido
        console.log('DynamicViewer: htmlContent vacío, sanitizedHtmlToShow es null.');
      }
    }
  }
}