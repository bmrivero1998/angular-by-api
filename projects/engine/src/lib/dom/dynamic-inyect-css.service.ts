import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DynamicInyectCssService {
  private styleElementIdPrefix = 'dynamic-style-';
  private renderer: Renderer2;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    rendererFactory: RendererFactory2
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Ahora acepta un targetElement opcional. 
   * Si se pasa, inyecta el estilo allí (útil para Shadow DOM).
   * Si no, lo inyecta en el HEAD (comportamiento default).
   */
  public injectCss(cssContent: string, styleId: string, targetElement?: HTMLElement): void {
    // 1. Limpieza previa (busca en el target o en el head)
    this.removeCss(styleId, targetElement);

    // 2. Crear el elemento style
    const styleElement = this.renderer.createElement('style');
    this.renderer.setAttribute(styleElement, 'id', styleId);
    this.renderer.appendChild(
      styleElement,
      this.renderer.createText(cssContent)
    );

    // 3. Inyectar en el destino correcto
    if (targetElement) {
      // Para Web Components: Inyectamos AL PRINCIPIO del contenedor para que no estorbe al HTML
      if (targetElement.firstChild) {
        this.renderer.insertBefore(targetElement, styleElement, targetElement.firstChild);
      } else {
        this.renderer.appendChild(targetElement, styleElement);
      }
    } else {
      // Para App Normal: Inyectamos en el HEAD
      this.renderer.appendChild(this.document.head, styleElement);
    }
  }

  removeCss(styleId: string, targetElement?: HTMLElement): void {
    // Si hay target, buscamos dentro de él. Si no, usamos document.getElementById global
    let styleElement: any;
    
    if (targetElement) {
      styleElement = targetElement.querySelector(`style[id="${styleId}"]`);
    } else {
      styleElement = this.document.getElementById(styleId);
    }

    if (styleElement) {
      // Remover del padre correcto
      const parent = targetElement || this.document.head;
      this.renderer.removeChild(parent, styleElement);
    }
  }

  public generateStyleId(componentId: string): string {
    // CORREGIDO: Sin basura HTML
    return `${this.styleElementIdPrefix}${componentId}`;
  }
}