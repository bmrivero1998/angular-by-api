import { Injectable } from '@angular/core';
import { ALLOWED_NAV_KEYS, KEY_FILTER_REGEX_MAP } from '../constants/dynamic-viewer.constants';

/**
 * Encapsula dos responsabilidades hermanas que antes eran métodos privados
 * gigantes del componente: filtrar teclas permitidas (keyFilter) y aplicar
 * máscaras de formato en vivo (inputMask, ej. "999-999" para teléfonos).
 *
 * Es stateless: no depende de Renderer2 ni de Angular Forms, así que se
 * puede testear con inputs/eventos simulados sin TestBed.
 */
@Injectable({ providedIn: 'root' })
export class InputMaskingService {
  /**
   * Determina si una tecla debe bloquearse según el `keyFilter` configurado.
   * @returns true si el evento debe cancelarse (preventDefault)
   */
  shouldBlockKey(event: KeyboardEvent, keyFilter: string): boolean {
    if (
      ALLOWED_NAV_KEYS.includes(event.key) ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return false;
    }

    if (keyFilter === 'decimal') {
      // El punto decimal se controla aparte (no permitir un segundo punto);
      // el llamador es responsable de esa validación con el valor actual.
      return !/^[0-9.]$/.test(event.key);
    }

    const predefined = KEY_FILTER_REGEX_MAP[keyFilter];
    if (predefined) {
      return !predefined.test(event.key);
    }

    try {
      const custom = new RegExp(`^${keyFilter}$`);
      return !custom.test(event.key);
    } catch {
      // Regex inválida: no bloqueamos, mejor dejar pasar y que el caller
      // decida si reporta el error (evita romper la UX por una mala config).
      return false;
    }
  }

  /**
   * Aplica una máscara tipo "999-AAA" sobre un valor crudo.
   * 9 = dígito, x/X = letra (se normaliza a mayúscula), * = alfanumérico.
   * Cualquier otro carácter de la máscara se trata como literal.
   *
   * @returns el valor formateado y el valor "limpio" (solo alfanumérico,
   *          útil para sincronizar el FormControl subyacente)
   */
  applyMask(rawValue: string, mask: string): { formatted: string; clean: string } {
    const cleanedInput = rawValue.replace(/[^a-zA-Z0-9]/g, '');
    let formatted = '';
    let valueIndex = 0;
    let maskIndex = 0;

    while (maskIndex < mask.length && valueIndex < cleanedInput.length) {
      const maskChar = mask[maskIndex];
      const inputChar = cleanedInput[valueIndex];

      const isDigit = maskChar === '9' && /[0-9]/.test(inputChar);
      const isAlpha = maskChar.toLowerCase() === 'x' && /[a-zA-Z]/.test(inputChar);
      const isAlphaNum = maskChar === '*' && /[a-zA-Z0-9]/.test(inputChar);

      if (isDigit || isAlpha || isAlphaNum) {
        formatted += isAlpha ? inputChar.toUpperCase() : inputChar;
        valueIndex++;
        maskIndex++;
      } else {
        formatted += maskChar;
        if (inputChar === maskChar) valueIndex++;
        maskIndex++;
      }
    }

    return { formatted, clean: formatted.replace(/[^a-zA-Z0-9]/g, '') };
  }

  /**
   * Calcula dónde debe quedar el cursor tras reformatear, contando
   * caracteres "de datos" (no literales de máscara) antes de la posición original.
   */
  computeCaretPosition(originalValue: string, cursorPosition: number, formattedValue: string): number {
    const dataCharsBeforeCursor = originalValue
      .substring(0, cursorPosition)
      .replace(/[^a-zA-Z0-9]/g, '').length;

    let newCursorPosition = 0;
    let dataCharsCounted = 0;
    for (const char of formattedValue) {
      newCursorPosition++;
      if (/[a-zA-Z0-9]/.test(char)) {
        dataCharsCounted++;
      }
      if (dataCharsCounted === dataCharsBeforeCursor) break;
    }
    return newCursorPosition;
  }
}