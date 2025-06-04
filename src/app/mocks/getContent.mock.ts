import {
  ButtonConfig,
  FormFieldMapping,
} from '../models/form-field-mapping.model'; // Ajusta la ruta si es necesario

interface MockApiItem {
  url: string;
  plantillaHTML: string;
  css?: string;
  htmlComponent?:any;
  cssComponent?:any;
  id_DocumentHTMLCSS: string;
  formId?: string;
  formMappings?: FormFieldMapping[];
  formInitialData?: any;
  buttonConfigs?: ButtonConfig[];
  buttonsConfig?:ButtonConfig[];
  validators?: any;
}

export const MockApiResponseData: { ok: boolean; doc: MockApiItem[] } = {
  ok: true,
  doc: [
    {
      url: 'http://localhost:4200/postal-code-lookup',
      plantillaHTML:
        '<div class="postal-code-search-container p-4 shadow-sm"><h2 class="mb-4 text-primary text-center fw-light">Buscar por Código Postal</h2><form name="postalCodeSearchForm" data-dynamic-form-id="postalSearch" id="postalCodeApiForm"><div><label for="postalCodeInput" class="form-label">Tu Código Postal (C.P.):</label><input type="text" id="postalCodeInput" name="postalCode" class="form-control form-control-lg" placeholder="Ej. 06500" required pattern="[0-9]{5}" title="Ingresa 5 dígitos del código postal"><div id="postalCodeInput-error" class="text-danger mt-1" style="font-size: 0.875em;"></div></div><div class="d-grid mt-4"><button type="submit" id="btnSearchPostalCodeApi" name="btnSearchPostalCode" class="btn btn-primary btn-lg" data-dynamic-action="lookupPostalCode">Buscar</button></div></form></div>',
      css: '.postal-code-search-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #ffffff; max-width: 400px; margin: 40px auto; border-radius: 0.375rem; } .postal-code-search-container h2.fw-light { font-weight: 300 !important; } .postal-code-search-container input[type="text"].form-control:focus { border-color: #86b7fe; box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25); } #postalCodeInput-error:not(:empty) { padding-top: .25rem; } .postal-code-search-container .btn-lg { padding-top: 0.75rem; padding-bottom: 0.75rem; }',
      id_DocumentHTMLCSS: '68377bceb0d57987a6550932',
      formId: 'lookupPostalCodeForm',
      formMappings: [
        {
          controlName: 'postalCode',
          domSelector: '#postalCodeInput',
          eventType: 'input',
          errorDisplaySelector: '#postalCodeInput-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'El código postal es requerido.' },
            {
              type: 'pattern',
              value: '^[0-9]{5}$',
              message: 'Debe ser un código postal de 5 dígitos.',
            },
          ],
        },
      ],
      formInitialData: {},
      buttonConfigs: [
        {
          selector: '#btnSearchPostalCodeApi',
          disableWhen: 'formIsInvalid',
        },
      ],
    },
    {
      url: 'http://localhost:4200/user-registration',
      plantillaHTML: `
        <div class="user-registration-container container mt-5 mb-5 p-4 p-md-5 border rounded-3 bg-light shadow-sm">
          <h2 class="text-center mb-4 text-primary">Formulario de Registro</h2>
          <form id="userRegistrationApiForm" name="userRegistrationForm">
            
            <div class="mb-3">
              <label for="fullNameInput" class="form-label">Nombre Completo:</label>
              <input type="text" class="form-control" id="fullNameInput" name="fullName" placeholder="Juan Pérez">
              <div id="fullNameInput-error" class="text-danger error-message mt-1"></div>
            </div>

            <div class="mb-3">
              <label for="emailInput" class="form-label">Correo Electrónico:</label>
              <input type="email" class="form-control" id="emailInput" name="email" placeholder="usuario@ejemplo.com">
              <div id="emailInput-error" class="text-danger error-message mt-1"></div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label for="passwordInput" class="form-label">Contraseña:</label>
                <input type="password" class="form-control" id="passwordInput" name="password">
                <div id="passwordInput-error" class="text-danger error-message mt-1"></div>
              </div>
              <div class="col-md-6 mb-3">
                <label for="confirmPasswordInput" class="form-label">Confirmar Contraseña:</label>
                <input type="password" class="form-control" id="confirmPasswordInput" name="confirmPassword">
                <div id="confirmPasswordInput-error" class="text-danger error-message mt-1"></div>
              </div>
            </div>
            
            <div class="mb-3">
              <label for="countrySelect" class="form-label">País:</label>
              <select class="form-select" id="countrySelect" name="country">
                <option value="">Selecciona un país...</option>
                <option value="MX">México</option>
                <option value="US">Estados Unidos</option>
                <option value="CA">Canadá</option>
                <option value="ES">España</option>
              </select>
              <div id="countrySelect-error" class="text-danger error-message mt-1"></div>
            </div>

            <div class="mb-3">
              <label class="form-label d-block">Género:</label>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="gender" id="genderMale" value="male">
                <label class="form-check-label" for="genderMale">Masculino</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="gender" id="genderFemale" value="female">
                <label class="form-check-label" for="genderFemale">Femenino</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="radio" name="gender" id="genderOther" value="other">
                <label class="form-check-label" for="genderOther">Otro</label>
              </div>
              <div id="gender-error" class="text-danger error-message mt-1"></div> </div>

            <div class="mb-3">
              <label for="commentsTextarea" class="form-label">Comentarios (Opcional):</label>
              <textarea class="form-control" id="commentsTextarea" name="comments" rows="3"></textarea>
              <div id="commentsTextarea-error" class="text-danger error-message mt-1"></div>
            </div>

            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" value="" id="termsCheckbox" name="acceptTerms">
              <label class="form-check-label" for="termsCheckbox">
                Acepto los <a href="#" target="_blank">términos y condiciones</a>
              </label>
              <div id="termsCheckbox-error" class="text-danger error-message mt-1"></div>
            </div>

            <div class="d-grid gap-2 d-md-flex justify-content-md-end mt-4">
              <button type="button" id="btnClearRegistrationForm" class="btn btn-outline-secondary me-md-2" data-dynamic-action="clearRegistrationForm">Limpiar</button>
              <button type="submit" id="btnSubmitRegistration" class="btn btn-primary">Registrar</button>
            </div>
          </form>
        </div>
      `,
      css: `
        .user-registration-container { max-width: 720px; }
        .error-message:not(:empty) { font-size: 0.875em; padding-top: .25rem; }
        /* Puedes añadir más estilos personalizados aquí si Bootstrap no es suficiente */
      `,
      id_DocumentHTMLCSS: 'user-registration-form-001',
      formId: 'userRegistration',
      formMappings: [
        {
          controlName: 'fullName',
          domSelector: '#fullNameInput',
          eventType: 'input',
          errorDisplaySelector: '#fullNameInput-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'El nombre completo es requerido.' },
            {
              type: 'minLength',
              value: 3,
              message: 'El nombre debe tener al menos 3 caracteres.',
            },
          ],
        },
        {
          controlName: 'email',
          domSelector: '#emailInput',
          eventType: 'input',
          errorDisplaySelector: '#emailInput-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'El correo es requerido.' },
            { type: 'email', message: 'Formato de correo inválido.' },
          ],
        },
        {
          controlName: 'password',
          domSelector: '#passwordInput',
          eventType: 'input',
          errorDisplaySelector: '#passwordInput-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'La contraseña es requerida.' },
            {
              type: 'minLength',
              value: 6,
              message: 'La contraseña debe tener al menos 6 caracteres.',
            },
          ],
        },
        {
          controlName: 'confirmPassword',
          domSelector: '#confirmPasswordInput',
          eventType: 'input',
          errorDisplaySelector: '#confirmPasswordInput-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'Confirma tu contraseña.' },
          ] /* Podrías añadir un validador a nivel de FormGroup para 'matchPassword' */,
        },
        {
          controlName: 'country',
          domSelector: '#countrySelect',
          eventType: 'change',
          errorDisplaySelector: '#countrySelect-error',
          defaultValue: '',
          validatorConfig: [
            { type: 'required', message: 'Selecciona un país.' },
          ],
        },
        {
          controlName: 'gender',
          domSelector: 'input[name="gender"]',
          eventType: 'change',
          errorDisplaySelector: '#gender-error',
          defaultValue: null /* o '' */,
        }, // Para radios, el selector puede ser por 'name'
        {
          controlName: 'comments',
          domSelector: '#commentsTextarea',
          eventType: 'input',
          errorDisplaySelector: '#commentsTextarea-error',
          defaultValue: '',
          validatorConfig: [
            {
              type: 'maxLength',
              value: 200,
              message: 'Máximo 200 caracteres.',
            },
          ],
        },
        {
          controlName: 'acceptTerms',
          domSelector: '#termsCheckbox',
          eventType: 'change',
          errorDisplaySelector: '#termsCheckbox-error',
          defaultValue: false,
          validatorConfig: [
            { type: 'requiredTrue', message: 'Debes aceptar los términos.' },
          ],
        }, // Para checkboxes 'required' significa 'requiredTrue'
      ],
      formInitialData: {},
      buttonConfigs: [
        { selector: '#btnSubmitRegistration', disableWhen: 'formIsInvalid' },
        { selector: '#btnClearRegistrationForm', disableWhen: 'formIsEmpty' },
      ],
    },
  ],
};
