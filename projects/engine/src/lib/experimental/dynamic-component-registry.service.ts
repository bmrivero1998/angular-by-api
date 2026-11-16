// services/dynamic-components-registry.service.ts
import { Injectable, Type, ComponentFactoryResolver, ViewContainerRef, ComponentRef, Injector } from '@angular/core';
import { Observable, BehaviorSubject, Subject } from 'rxjs';

export interface DynamicComponentConfig {
  type: string; // 'stepper', 'accordion', 'tabs', 'modal', 'carousel'
  id: string;
  config: any;
  position?: 'before' | 'after' | 'replace' | 'append';
  targetSelector?: string;
}

export interface DynamicComponentInstance {
  id: string;
  type: string;
  instance: any;
  componentRef?: ComponentRef<any>;
  destroy: () => void;
}

@Injectable({ providedIn: 'root' })
export class DynamicComponentsRegistryService {
  private registeredComponents = new Map<string, Type<any>>();
  private activeInstances = new Map<string, DynamicComponentInstance>();
  private componentEvents = new Map<string, Subject<any>>();
  
  private registry$ = new BehaviorSubject<Map<string, Type<any>>>(this.registeredComponents);
  private instances$ = new BehaviorSubject<Map<string, DynamicComponentInstance>>(this.activeInstances);

  constructor(
    private cfr: ComponentFactoryResolver,
    private injector: Injector
  ) {}

  /**
   * Registra un componente dinámico
   */
  registerComponent(type: string, component: Type<any>): void {
    this.registeredComponents.set(type, component);
    this.registry$.next(this.registeredComponents);
  }

  /**
   * Crea una instancia de un componente dinámico
   */
  createComponent<T>(
    config: DynamicComponentConfig,
    viewContainer: ViewContainerRef,
    context?: any
  ): DynamicComponentInstance | null {
    
    const componentType = this.registeredComponents.get(config.type);
    if (!componentType) {
      console.error(`Component type "${config.type}" not registered`);
      return null;
    }

    try {
      // Crear factory y componente
      const factory = this.cfr.resolveComponentFactory(componentType);
      const componentRef = viewContainer.createComponent(factory, 0, this.injector);
      
      // Configurar el componente
      const instance = componentRef.instance as any;
      if (typeof instance.initialize === 'function') {
        instance.initialize(config.config, context);
      }

      // Crear instancia de manejo
      const dynamicInstance: DynamicComponentInstance = {
        id: config.id,
        type: config.type,
        instance,
        componentRef,
        destroy: () => {
          componentRef.destroy();
          this.activeInstances.delete(config.id);
          this.componentEvents.delete(config.id);
          this.instances$.next(this.activeInstances);
        }
      };

      // Guardar y emitir
      this.activeInstances.set(config.id, dynamicInstance);
      this.instances$.next(this.activeInstances);

      // Crear subject para eventos
      this.componentEvents.set(config.id, new Subject<any>());

      return dynamicInstance;
    } catch (error) {
      console.error(`Error creating component ${config.type}:`, error);
      return null;
    }
  }

  /**
   * Obtiene una instancia por ID
   */
  getInstance(id: string): DynamicComponentInstance | undefined {
    return this.activeInstances.get(id);
  }

  /**
   * Destruye una instancia
   */
  destroyInstance(id: string): boolean {
    const instance = this.activeInstances.get(id);
    if (instance) {
      instance.destroy();
      return true;
    }
    return false;
  }

  /**
   * Emite un evento a un componente específico
   */
  emitToComponent(id: string, event: string, data?: any): void {
    const instance = this.activeInstances.get(id);
    if (instance && typeof instance.instance.handleEvent === 'function') {
      instance.instance.handleEvent(event, data);
    }
  }

  /**
   * Escucha eventos de un componente
   */
  listenToComponent(id: string): Observable<any> | null {
    const subject = this.componentEvents.get(id);
    return subject ? subject.asObservable() : null;
  }

  /**
   * Limpia todos los componentes
   */
  clearAll(): void {
    this.activeInstances.forEach(instance => instance.destroy());
    this.activeInstances.clear();
    this.componentEvents.clear();
    this.instances$.next(this.activeInstances);
  }
}