
import { DynamicContentInterface } from '../interfaces/DynamicContent.interface'; // Ajusta la ruta

export const MOCK_DATA_COMPLEX_FORM: DynamicContentInterface = {
  configuracion: `FormComplex-${Math.random().toString(36).substring(2, 9)}`,
  plantillaHTML: `
<div class="dynamic-container">
  <h2>Formulario de Registro Detallado</h2>
  <p>Por favor, completa todos los campos requeridos.</p>

  <form name="registroDetalladoForm" data-dynamic-form-id="userRegistration">
    <fieldset>
      <legend>Información Personal</legend>
      <div>
        <label for="nombreCompleto">Nombre Completo:</label>
        <input type="text" id="nombreCompleto" name="nombreCompleto" required placeholder="Ej. Ana Sofía Paredes">
      </div>
      <div>
        <label for="correoElectronico">Correo Electrónico:</label>
        <input type="email" id="correoElectronico" name="correoElectronico" required placeholder="ana.paredes@ejemplo.com">
      </div>
      <div>
        <label for="telefono">Teléfono (opcional):</label>
        <input  type="tel"
       id="telefonoMx10Digitos"
       name="telefonoMx10Digitos"
       pattern="[0-9]{10}"
       title="Ingresa 10 dígitos sin espacios ni guiones."
       placeholder="Ej: 5512345678"
       required>
      </div>
      <div>
        <label for="fechaNacimiento">Fecha de Nacimiento:</label>
        <input type="date" id="fechaNacimiento" name="fechaNacimiento">
      </div>
    </fieldset>

    <fieldset>
      <legend>Preferencias y Perfil</legend>
      <div>
        <label for="paisResidencia">País de Residencia:</label>
        <select id="paisResidencia" name="paisResidencia">
          <option value="">-- Selecciona un país --</option>
          <option value="MX">México</option>
          <option value="CO">Colombia</option>
          <option value="AR">Argentina</option>
          <option value="ES">España</option>
          <option value="OT">Otro</option>
        </select>
      </div>
      <div>
        <p>Nivel de Experiencia:</p>
        <label><input type="radio" name="nivelExperiencia" value="principiante" checked> Principiante</label>
        <label><input type="radio" name="nivelExperiencia" value="intermedio"> Intermedio</label>
        <label><input type="radio" name="nivelExperiencia" value="avanzado"> Avanzado</label>
      </div>
      <div>
        <p>Áreas de Interés (puedes seleccionar varias):</p>
        <label><input type="checkbox" name="areasInteres" value="tecnologia"> Tecnología y Desarrollo</label>
        <label><input type="checkbox" name="areasInteres" value="diseno"> Diseño UX/UI</label>
        <label><input type="checkbox" name="areasInteres" value="marketing"> Marketing Digital</label>
        <label><input type="checkbox" name="areasInteres" value="negocios"> Negocios y Emprendimiento</label>
      </div>
      <div>
        <label for="comentariosAdicionales">Comentarios Adicionales:</label>
        <textarea id="comentariosAdicionales" name="comentariosAdicionales" rows="3" placeholder="Algo más que quieras añadir..."></textarea>
      </div>
    </fieldset>

    <fieldset>
        <legend>Confirmación</legend>
        <div>
            <label>
                <input type="checkbox" name="aceptaPoliticaPrivacidad" value="si" required>
                He leído y acepto la <a href="#" data-dynamic-action="verPoliticaPrivacidad" title="Ver Política de Privacidad">política de privacidad</a>.
            </label>
        </div>
    </fieldset>

    <div class="form-actions">
      <button type="submit" name="btnEnviarFormulario" data-dynamic-action="enviarFormularioDetallado">Enviar Registro</button>
      <button type="reset" name="btnLimpiarCampos" data-dynamic-action="limpiarFormularioDetallado">Limpiar Campos</button>
      <button type="button" name="btnAyuda" data-dynamic-action="mostrarAyudaFormulario">Ayuda</button>
    </div>
  </form>

  <div id="form-output-area" class="form-output" style="display:none; margin-top: 20px; padding: 10px; border: 1px dashed #ccc; background-color: #f9f9f9; white-space: pre-wrap;">
    <h4>Datos Enviados (simulación):</h4>
    <pre></pre>
  </div>
</div>`,
  css: `
.dynamic-container {
  font-family: Arial, sans-serif;
  padding: 20px;
  border: 1px solid #ddd;
  background-color: #fcfcfc;
  max-width: 700px;
  margin: 20px auto;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
.dynamic-container h2 {
  color: #333;
  text-align: center;
  margin-bottom: 10px;
}
.dynamic-container p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
}
.dynamic-container fieldset {
  border: 1px solid #ccc;
  padding: 15px 20px;
  margin-bottom: 20px;
  border-radius: 5px;
  background-color: #fff;
}
.dynamic-container legend {
  font-weight: bold;
  color: #007bff;
  padding: 0 10px;
  font-size: 1.1em;
}
.dynamic-container div {
  margin-bottom: 12px;
}
.dynamic-container label {
  display: block;
  margin-bottom: 5px;
  color: #555;
  font-size: 0.95em;
}
.dynamic-container input[type="text"],
.dynamic-container input[type="email"],
.dynamic-container input[type="tel"],
.dynamic-container input[type="date"],
.dynamic-container input[type="password"], /* Si lo tuvieras */
.dynamic-container textarea,
.dynamic-container select {
  width: 100%; /* Full width */
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box; /* Importante para que padding no afecte el width total */
  font-size: 0.9em;
}
.dynamic-container textarea {
  resize: vertical;
  min-height: 60px;
}
.dynamic-container input[type="radio"],
.dynamic-container input[type="checkbox"] {
  margin-right: 5px;
  vertical-align: middle;
}
/* Estilo para labels de radio/checkbox en línea */
.dynamic-container fieldset div > label:has(input[type="radio"]),
.dynamic-container fieldset div > label:has(input[type="checkbox"]) {
    display: inline-block;
    margin-right: 20px; /* Espacio entre opciones */
    font-weight: normal; /* Resetear el bold de los labels principales */
    cursor: pointer;
}
.dynamic-container .form-actions {
  text-align: right;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}
.dynamic-container button, .dynamic-container button[type="submit"], .dynamic-container button[type="reset"], .dynamic-container button[type="button"] {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1em;
  margin-left: 10px;
  transition: background-color 0.2s ease-in-out;
}
.dynamic-container button[type="submit"], .dynamic-container button[data-dynamic-action^="enviar"] {
  background-color: #28a745; /* Verde */
  color: white;
}
.dynamic-container button[type="submit"]:hover, .dynamic-container button[data-dynamic-action^="enviar"]:hover {
  background-color: #218838;
}
.dynamic-container button[type="reset"], .dynamic-container button[data-dynamic-action^="limpiar"] {
  background-color: #ffc107; /* Amarillo */
  color: #333;
}
.dynamic-container button[type="reset"]:hover, .dynamic-container button[data-dynamic-action^="limpiar"]:hover {
  background-color: #e0a800;
}
.dynamic-container button[type="button"], .dynamic-container button:not([type="submit"]):not([type="reset"]) {
  background-color: #6c757d; /* Gris */
  color: white;
}
.dynamic-container button[type="button"]:hover, .dynamic-container button:not([type="submit"]):not([type="reset"]):hover {
  background-color: #5a6268;
}
.dynamic-container a[data-dynamic-action] {
    color: #007bff;
    text-decoration: underline;
    cursor: pointer;
}
.form-output {
    border: 1px solid #007bff;
    background-color: #e7f3ff;
    padding: 15px;
    border-radius: 5px;
}
.form-output h4 {
    margin-top: 0;
    color: #0056b3;
}
`,
  otros: { schemaVersion: '1.1', formType: 'detailedRegistration' }
};