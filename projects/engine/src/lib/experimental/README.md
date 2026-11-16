# experimental

Código sin terminar: navegación entre pantallas (`DynamicNavigationService`) y registro de componentes dinámicos (`DynamicComponentsRegistryService`).

- No se exporta en `public-api.ts`.
- No lo usa el `runtime`.
- No tiene tests.
- Está pensado para componentes Angular (callbacks, `ViewContainerRef`) y no tiene un contrato JSON que lo describa, así que no se puede usar desde el custom element.

Puede cambiar o desaparecer sin aviso. Para promover algo de aquí a la API pública hace falta terminarlo, cubrirlo con tests y documentarlo.

El stepper que había aquí se terminó y se reescribió como formularios de varios pasos dirigidos por el HTML (ver `docs/steppers.md`).
