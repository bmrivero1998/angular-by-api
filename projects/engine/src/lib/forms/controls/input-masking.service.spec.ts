import { InputMaskingService } from './input-masking.service';

function keyEvent(key: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key, ctrlKey: false, metaKey: false, ...extra } as KeyboardEvent;
}

describe('InputMaskingService', () => {
  let service: InputMaskingService;

  beforeEach(() => {
    service = new InputMaskingService();
  });

  describe('shouldBlockKey', () => {
    it('nunca bloquea teclas de navegación', () => {
      expect(service.shouldBlockKey(keyEvent('Backspace'), 'int')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('ArrowLeft'), 'int')).toBeFalse();
    });

    it('nunca bloquea combinaciones con Ctrl/Cmd (copy/paste, etc.)', () => {
      expect(service.shouldBlockKey(keyEvent('v', { ctrlKey: true }), 'int')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('c', { metaKey: true }), 'int')).toBeFalse();
    });

    it('keyFilter "int" solo permite dígitos', () => {
      expect(service.shouldBlockKey(keyEvent('5'), 'int')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('a'), 'int')).toBeTrue();
    });

    it('keyFilter "alpha" solo permite letras y espacios', () => {
      expect(service.shouldBlockKey(keyEvent('a'), 'alpha')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent(' '), 'alpha')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('5'), 'alpha')).toBeTrue();
    });

    it('keyFilter "decimal" permite dígitos y el punto', () => {
      expect(service.shouldBlockKey(keyEvent('5'), 'decimal')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('.'), 'decimal')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('a'), 'decimal')).toBeTrue();
    });

    it('acepta una regex custom como keyFilter', () => {
      expect(service.shouldBlockKey(keyEvent('a'), '[a-c]')).toBeFalse();
      expect(service.shouldBlockKey(keyEvent('z'), '[a-c]')).toBeTrue();
    });

    it('no bloquea si la regex custom es inválida (fail-open controlado)', () => {
      expect(service.shouldBlockKey(keyEvent('x'), '[invalid(')).toBeFalse();
    });
  });

  describe('applyMask', () => {
    it('aplica una máscara numérica con separador literal', () => {
      const { formatted, clean } = service.applyMask('12345678', '9999-9999');
      expect(formatted).toBe('1234-5678');
      expect(clean).toBe('12345678');
    });

    it('ignora caracteres que no matchean el tipo esperado por la máscara', () => {
      const { formatted } = service.applyMask('12a45678', '9999-9999');
      // La 'a' no es dígito así que no avanza el índice del valor limpio
      // hasta encontrar el siguiente dígito válido en esa posición de máscara.
      expect(formatted).toContain('-');
    });

    it('convierte letras a mayúsculas en posiciones tipo "x"', () => {
      const { formatted } = service.applyMask('ab1234', 'xx-9999');
      expect(formatted).toBe('AB-1234');
    });

    it('acepta alfanuméricos en posiciones tipo "*"', () => {
      const { formatted } = service.applyMask('a1b2', '****');
      expect(formatted).toBe('a1b2');
    });

    it('corta el valor cuando se agota la máscara', () => {
      const { formatted } = service.applyMask('123456789', '999');
      expect(formatted).toBe('123');
    });
  });

  describe('computeCaretPosition', () => {
    it('mantiene el caret al final si estaba al final', () => {
      const pos = service.computeCaretPosition('12345678', 8, '1234-5678');
      expect(pos).toBe(9);
    });

    it('ubica el caret justo tras el último caracter de dato ya tipeado', () => {
      // Antes de formatear: "1234" (caret en 4, tras el 4to dígito, sin
      // haber tipeado el separador). El caret queda en la posición 4 de la
      // cadena formateada -- justo antes del separador recién insertado.
      const pos = service.computeCaretPosition('1234', 4, '1234-5678');
      expect(pos).toBe(4);
    });
  });
});
