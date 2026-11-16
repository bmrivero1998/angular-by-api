import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { scopeCss } from './css-scoper';

export interface InjectCssOptions {
  /**
   * Clase del elemento que contiene la sección (`dynamic-<id>`). Si se indica,
   * el CSS se reescribe para que solo aplique dentro de ese elemento; ver
   * `scopeCss`. Sin ella el CSS se inserta tal cual y es global.
   */
  scopeClass?: string;
}

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
   *
   * Con `options.scopeClass` el CSS queda aislado a esa sección (ver `scopeCss`).
   */
  public injectCss(
    cssContent: string,
    styleId: string,
    targetElement?: HTMLElement,
    options?: InjectCssOptions,
  ): void {
    // 1. Limpieza previa (busca en el target o en el head)
    this.removeCss(styleId, targetElement);

    if (options?.scopeClass) {
      cssContent = scopeCss(cssContent, options.scopeClass);
    }

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