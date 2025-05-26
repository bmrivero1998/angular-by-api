import { DynamicContentInterface } from "../interfaces/DynamicContent.interface";

export const MOCK_DATA: DynamicContentInterface = {
    configuracion: `Configuración para ID: ${Math.random().toString(36).substring(2, 15)}`,
    plantillaHTML: `<div class="dynamic-container">
                      <h2>Título Dinámico</h2>
                      <p>Este es un párrafo cargado dinámicamente con su estilo.</p>
                      <button class="dynamic-button">Botón Dinámico</button>
                    </div>`,  
    css: `.dynamic-container {
            border: 2px solid blue;
            padding: 20px;
            margin-top: 15px;
            background-color: #eef;
            font-family: Arial, sans-serif;
          }
          .dynamic-button {
            background-color: blue;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          }
          .dynamic-button:hover {
            background-color: darkblue;
          }`,
    otros: { info: 'Información adicional' }
  };