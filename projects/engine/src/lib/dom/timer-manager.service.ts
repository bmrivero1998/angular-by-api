import { Injectable } from '@angular/core';

/**
 * Encapsula el ciclo de vida de timers (setTimeout/setInterval) para que
 * cualquier componente/servicio pueda "agendar" trabajo diferido y limpiarlo
 * de forma segura en su ngOnDestroy, sin reinventar Sets de IDs cada vez.
 *
 * Usar como providedIn: 'root' está bien SIEMPRE que cada consumidor llame
 * a `releaseAll(scopeId)` en su propio OnDestroy. Si prefieres aislamiento
 * total por instancia de componente, provéelo en el nivel del componente
 * (providers: [TimerManagerService]) en vez de root.
 */
@Injectable({ providedIn: 'root' })
export class TimerManagerService {
  private timeoutIds = new Set<number>();
  private intervalIds = new Set<number>();

  safeTimeout(callback: () => void, delay: number, onError?: (err: unknown) => void): number {
    const id = window.setTimeout(() => {
      try {
        callback();
      } catch (error) {
        console.error('Error en safeTimeout:', error);
        onError?.(error);
      } finally {
        this.timeoutIds.delete(id);
      }
    }, delay);

    this.timeoutIds.add(id);
    return id;
  }

  safeInterval(callback: () => void, delay: number, onError?: (err: unknown) => void): number {
    const id = window.setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error('Error en safeInterval:', error);
        onError?.(error);
      }
    }, delay);

    this.intervalIds.add(id);
    return id;
  }

  cancelTimeout(id: number): void {
    clearTimeout(id);
    this.timeoutIds.delete(id);
  }

  cancelInterval(id: number): void {
    clearInterval(id);
    this.intervalIds.delete(id);
  }

  /** Cancela todo lo pendiente. Llamar en ngOnDestroy del consumidor. */
  cancelAll(): void {
    this.timeoutIds.forEach((id) => clearTimeout(id));
    this.intervalIds.forEach((id) => clearInterval(id));
    this.timeoutIds.clear();
    this.intervalIds.clear();
  }
}