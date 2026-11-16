import {
  actionWords,
  isCloseAction,
  isResetAction,
  isSaveAction,
  isSubmitAction,
} from './action-names';

describe('action-names', () => {
  describe('actionWords', () => {
    it('separa por guion bajo, guion, punto, dos puntos y espacios', () => {
      expect(actionWords('close_modal')).toEqual(['close', 'modal']);
      expect(actionWords('close-modal')).toEqual(['close', 'modal']);
      expect(actionWords('close.modal')).toEqual(['close', 'modal']);
      expect(actionWords('close:modal')).toEqual(['close', 'modal']);
      expect(actionWords('close modal')).toEqual(['close', 'modal']);
    });

    it('separa camelCase y pasa a minúsculas', () => {
      expect(actionWords('closeModal')).toEqual(['close', 'modal']);
      expect(actionWords('SUBMIT_Form')).toEqual(['submit', 'form']);
    });

    it('tolera vacío, null y undefined', () => {
      expect(actionWords('')).toEqual([]);
      expect(actionWords(null)).toEqual([]);
      expect(actionWords(undefined)).toEqual([]);
    });
  });

  describe('isSubmitAction', () => {
    ['submit', 'submit_form', 'submit-order', 'submitForm', 'SUBMIT'].forEach((name) =>
      it(`reconoce "${name}"`, () => expect(isSubmitAction(name)).toBeTrue()),
    );

    ['resubmit', 'unsubmitted', 'sub', 'open_modal', 'save'].forEach((name) =>
      it(`no confunde "${name}"`, () => expect(isSubmitAction(name)).toBeFalse()),
    );
  });

  describe('isResetAction', () => {
    ['reset', 'reset_form', 'reset-form', 'resetForm', 'resetForms', 'form_reset'].forEach((name) =>
      it(`reconoce "${name}"`, () => expect(isResetAction(name)).toBeTrue()),
    );

    // Un flujo de recuperación de contraseña no debe borrar lo que el usuario escribió.
    ['reset_password', 'password_reset', 'reset_filters', 'reset_form_and_close', 'preset', 'form'].forEach((name) =>
      it(`no confunde "${name}"`, () => expect(isResetAction(name)).toBeFalse()),
    );
  });

  describe('isCloseAction', () => {
    ['close', 'close_modal', 'closeModal', 'cancel', 'modal-cancel', 'modal_dismiss', 'dismiss'].forEach((name) =>
      it(`reconoce "${name}"`, () => expect(isCloseAction(name)).toBeTrue()),
    );

    // El caso que motivó el cambio: abrir un modal no es cerrarlo.
    ['open_modal', 'show_modal', 'modal', 'modal_help', 'modal_confirm', 'disclose', 'enclosure', 'closet'].forEach(
      (name) => it(`no confunde "${name}"`, () => expect(isCloseAction(name)).toBeFalse()),
    );
  });

  describe('isSaveAction', () => {
    it('reconoce save y save_changes, y no saved ni autosave', () => {
      expect(isSaveAction('save')).toBeTrue();
      expect(isSaveAction('save_changes')).toBeTrue();
      expect(isSaveAction('saved')).toBeFalse();
      expect(isSaveAction('autosave')).toBeFalse();
    });
  });
});
