# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público para un problema de seguridad. Usa el reporte privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio.

Incluye, si puedes:

- Qué versión o commit usaste.
- Un JSON mínimo que reproduzca el problema.
- Qué puede hacer un atacante con él.

## Alcance

Este proyecto renderiza HTML y CSS que llegan en un JSON. Son especialmente relevantes los reportes sobre:

- HTML que consiga ejecutar código pese al sanitizado.
- Expresiones `showIf` / `hideIf` o cualquier otro campo del JSON que permita ejecutar código de forma inesperada.
- CSS que afecte o extraiga datos de la página host.

El modelo de confianza y lo que se sanitiza están descritos en [docs/security.md](docs/security.md).
