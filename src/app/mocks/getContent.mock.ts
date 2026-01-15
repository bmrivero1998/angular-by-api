import { ApiDrivenContent } from '../../../projects/dynamic-forms-engine/src/lib/interfaces/DynamicContent.interface';

export const FORM_PRO_MOCK: ApiDrivenContent = {
  id_DocumentHTMLCSS: 'registro-pro-001',
  renderType: 'dynamic',
  // HTML con Bootstrap y un input tipo Web Component ficticio
  htmlComponent: `
    <div class="card p-4 shadow">
      <h2 class="mb-4">Registro de Usuario Pro</h2>
      <form id="formRegistro">
        <div class="mb-3">
          <label class="form-label">Nombre de Usuario</label>
          <input name="username" class="form-control" placeholder="Escribe tu alias...">
          <div id="user-error" class="text-danger small mt-1"></div>
        </div>

        <div class="mb-3">
          <label class="form-label">Tipo de Cuenta</label>
          <select name="tipoCuenta" class="form-select">
            <option value="estandar">Estándar</option>
            <option value="premium">Premium</option>
          </select>
        </div>

        <div id="seccionPremium" class="mb-3 border-start border-primary ps-3">
          <label class="form-label">Código de Invitación Premium</label>
          <input name="codigoVip" class="form-control" placeholder="VIP-XXXX">
        </div>

        <button id="btnEnviar" class="btn btn-primary w-100 mt-3" data-dynamic-action="submit_form">
          Registrar Ahora
        </button>
      </form>
    </div>
  `,
  cssComponent: `
    .card { border-radius: 15px; }
    .is-invalid { border-color: #dc3545 !important; }
    .is-valid { border-color: #198754 !important; }
  `,
  formMappings: [
    {
      controlName: 'username',
      domSelector: 'input[name="username"]',
      errorDisplaySelector: '#user-error',
      validatorConfig: [
        { type: 'required', message: 'El alias es obligatorio.' },
        { type: 'minlength', value: 5, message: 'Mínimo 5 caracteres.' }
      ],
      // Validación asíncrona real contra tu API
      asyncValidator: {
        endpoint: '/check-username',
        method: 'GET',
        errorKey: 'userTaken',
        message: '¡Este nombre ya está en uso!',
        debounceTime: 800
      }
    },
    {
      controlName: 'tipoCuenta',
      domSelector: 'select[name="tipoCuenta"]',
      defaultValue: 'estandar'
    },
    {
      controlName: 'codigoVip',
      domSelector: '#seccionPremium',
      showIf: "form.tipoCuenta === 'premium'", // Lógica Condicional Pro
      validatorConfig: [
        { type: 'required', message: 'El código VIP es necesario para cuentas Premium.' }
      ]
    }
  ],
  buttonConfigs: [
    {
      selector: '#btnEnviar',
      disableWhen: 'formIsInvalid' // Deshabilitar si hay errores o está validando
    }
  ]
};