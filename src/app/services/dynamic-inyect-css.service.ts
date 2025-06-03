import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DynamicInyectCssService {
  private styleElementIdPrefix = 'dynamic-style-';
  private renderer: Renderer2;

  constructor(@Inject(DOCUMENT) private document: Document,
  private rendererFactory: RendererFactory2) {
        this.renderer = rendererFactory.createRenderer(null, null);
   }


  public injectCss(cssContent: string, styleId: string): void {
    this.removeCss(styleId); // Remueve si ya existe uno con el mismo ID

    const styleElement = this.renderer.createElement('style');
    this.renderer.setAttribute(styleElement, 'id', styleId);
    this.renderer.appendChild(styleElement, this.renderer.createText(cssContent));
    this.renderer.appendChild(this.document.head, styleElement);
  }


  removeCss(styleId: string): void {
    const styleElement = this.document.getElementById(styleId);
    if (styleElement) {
      this.renderer.removeChild(this.document.head, styleElement);
    }
  }

  public generateStyleId(componentId: string): string {
    // Usar comillas invertidas (`) para la interpolación
    return `<span class="math-inline">${this.styleElementIdPrefix}</span>${componentId}`;
  }
}
