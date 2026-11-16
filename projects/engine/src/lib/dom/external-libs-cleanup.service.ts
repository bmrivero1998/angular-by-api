import { Injectable } from '@angular/core';

/**
 * Antes: 8 métodos privados de ~15-30 líneas cada uno, todos mezclados en
 * el componente principal, todos con el mismo patrón (buscar elementos,
 * intentar destruir, atrapar error, loguear warning).
 *
 * Ahora: un solo servicio con un método público `cleanupAll(container)`
 * que orquesta limpiadores individuales. Si mañana agregan soporte para
 * otra librería (ej. Select2, Choices.js), se agrega un método aquí sin
 * tocar el componente en absoluto — cumple Open/Closed.
 */
@Injectable({ providedIn: 'root' })
export class ExternalLibsCleanupService {
  cleanupAll(container: HTMLElement): void {
    this.cleanupQuill(container);
    this.cleanupFlatpickr(container);
    this.cleanupBootstrapDatepicker(container);
    this.cleanupTinyMCE(container);
    this.cleanupCKEditor(container);
    this.cleanupSliders(container);
    this.cleanupBootstrapComponents(container);
    this.cleanupRecaptcha(container);
    this.cleanupGenericWidgets(container);
  }

  private cleanupQuill(container: HTMLElement): void {
    container.querySelectorAll('.ql-editor').forEach((editor) => {
      const instance = (editor as any).__quill;
      if (instance?.destroy) {
        try {
          instance.destroy();
          (editor as any).__quill = null;
        } catch (error) {
          console.warn('Error destruyendo instancia Quill:', error);
        }
      }
    });

    container.querySelectorAll('[data-quill-instance]').forEach((el) => {
      const instanceId = el.getAttribute('data-quill-instance');
      if (instanceId && (window as any)[instanceId]) {
        try {
          (window as any)[instanceId].destroy();
          (window as any)[instanceId] = null;
          el.removeAttribute('data-quill-instance');
        } catch (error) {
          console.warn(`Error destruyendo Quill instance ${instanceId}:`, error);
        }
      }
    });
  }

  private cleanupFlatpickr(container: HTMLElement): void {
    container.querySelectorAll('.flatpickr-input, [data-fp-instance]').forEach((input) => {
      const fpInstance = (input as any)._flatpickr;
      if (fpInstance?.destroy) {
        try {
          fpInstance.destroy();
          (input as any)._flatpickr = null;
        } catch (error) {
          console.warn('Error destruyendo Flatpickr:', error);
        }
      }

      const instanceId = input.getAttribute('data-fp-instance');
      if (instanceId && (window as any)[instanceId]) {
        try {
          (window as any)[instanceId].destroy();
          (window as any)[instanceId] = null;
          input.removeAttribute('data-fp-instance');
        } catch (error) {
          console.warn(`Error destruyendo Flatpickr instance ${instanceId}:`, error);
        }
      }
    });
  }

  private cleanupBootstrapDatepicker(container: HTMLElement): void {
    const $ = (window as any).jQuery;
    if (!$?.fn?.datepicker) return;

    container.querySelectorAll('.datepicker, [data-datepicker]').forEach((input) => {
      try {
        const $input = $(input);
        if ($input.data('datepicker')) {
          $input.datepicker('destroy');
          $input.removeData('datepicker');
        }
      } catch (error) {
        console.warn('Error destruyendo Bootstrap Datepicker:', error);
      }
    });
  }

  private cleanupTinyMCE(container: HTMLElement): void {
    const tinymce = (window as any).tinymce;
    if (!tinymce) return;

    const ids: string[] = [];
    container.querySelectorAll('.mce-tinymce, [data-tinymce-id]').forEach((editor) => {
      const id = editor.id || editor.getAttribute('data-tinymce-id');
      if (id) ids.push(id);
    });

    ids.forEach((id) => {
      try {
        tinymce.get(id)?.remove?.();
      } catch (error) {
        console.warn(`Error destruyendo TinyMCE instance ${id}:`, error);
      }
    });
  }

  private cleanupCKEditor(container: HTMLElement): void {
    const CKEDITOR = (window as any).CKEDITOR;
    if (!CKEDITOR) return;

    Object.keys(CKEDITOR.instances).forEach((name) => {
      const instance = CKEDITOR.instances[name];
      const el = instance?.container?.$;
      if (el && container.contains(el)) {
        try {
          instance.destroy();
        } catch (error) {
          console.warn(`Error destruyendo CKEditor instance ${name}:`, error);
        }
      }
    });
  }

  private cleanupSliders(container: HTMLElement): void {
    container.querySelectorAll('[data-nouislider]').forEach((slider) => {
      const instance = (slider as any).noUiSlider;
      if (instance?.destroy) {
        try {
          instance.destroy();
          (slider as any).noUiSlider = null;
        } catch (error) {
          console.warn('Error destruyendo noUiSlider:', error);
        }
      }
    });

    const $ = (window as any).jQuery;
    if ($?.fn?.slider) {
      container.querySelectorAll('.ui-slider').forEach((slider) => {
        try {
          const $slider = $(slider);
          if ($slider.hasClass('ui-slider')) $slider.slider('destroy');
        } catch (error) {
          console.warn('Error destruyendo jQuery UI Slider:', error);
        }
      });
    }
  }

  private cleanupBootstrapComponents(container: HTMLElement): void {
    const $ = (window as any).jQuery;
    if (!$) return;

    container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      try {
        const $el = $(el);
        if ($el.data?.('bs.tooltip')) $el.tooltip('dispose');
      } catch (error) {
        console.warn('Error limpiando Bootstrap Tooltip:', error);
      }
    });

    container.querySelectorAll('[data-bs-toggle="popover"]').forEach((el) => {
      try {
        const $el = $(el);
        if ($el.data?.('bs.popover')) $el.popover('dispose');
      } catch (error) {
        console.warn('Error limpiando Bootstrap Popover:', error);
      }
    });

    container.querySelectorAll('.modal').forEach((el) => {
      try {
        $(el).modal?.('hide');
      } catch {
        // ignorar: el modal pudo no estar inicializado
      }
    });
  }

  private cleanupRecaptcha(container: HTMLElement): void {
    const grecaptcha = (window as any).grecaptcha;
    if (!grecaptcha) return;

    container.querySelectorAll('.g-recaptcha, [data-recaptcha-id]').forEach((el) => {
      const widgetId = el.getAttribute('data-recaptcha-id');
      if (widgetId) {
        try {
          grecaptcha.reset(widgetId);
        } catch (error) {
          console.warn('Error reseteando reCAPTCHA:', error);
        }
      }
    });
  }

  private cleanupGenericWidgets(container: HTMLElement): void {
    container.querySelectorAll('[data-widget-id]').forEach((el) => {
      const widgetId = el.getAttribute('data-widget-id');
      if (widgetId) {
        const widget = (window as any)[`widget_${widgetId}`];
        if (widget?.destroy) {
          try {
            widget.destroy();
          } catch (error) {
            console.warn(`Error destruyendo widget ${widgetId}:`, error);
          }
        }
        (window as any)[`widget_${widgetId}`] = null;
        el.removeAttribute('data-widget-id');
      }

      ['click', 'change', 'input', 'blur', 'focus'].forEach((key) => {
        const listenerId = el.getAttribute(`data-listener-${key}`);
        if (listenerId && (window as any)[listenerId]) {
          try {
            el.removeEventListener(key, (window as any)[listenerId]);
            (window as any)[listenerId] = null;
          } catch (error) {
            console.warn(`Error removiendo listener ${listenerId}:`, error);
          }
        }
      });
    });
  }
}