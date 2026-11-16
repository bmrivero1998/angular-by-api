// services/dynamic-stepper.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface StepperStep {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  status: 'pending' | 'active' | 'completed' | 'error' | 'disabled';
  validator?: () => boolean | Promise<boolean>;
  data?: any;
}

export interface StepperConfig {
  id: string;
  steps: StepperStep[];
  linear?: boolean; // Requiere completar pasos en orden
  vertical?: boolean;
  showNavigation?: boolean;
  showProgress?: boolean;
  allowSkip?: boolean;
  currentStepIndex?: number;
  onStepChange?: (currentStep: StepperStep, previousStep: StepperStep) => void;
  onComplete?: (allSteps: StepperStep[]) => void;
}

@Injectable({ providedIn: 'root' })
export class DynamicStepperService {
  private steppers = new Map<string, BehaviorSubject<StepperConfig>>();

  /**
   * Crea o actualiza un stepper
   */
  createOrUpdateStepper(config: StepperConfig): Observable<StepperConfig> {
    const existing = this.steppers.get(config.id);
    
    if (existing) {
      // Actualizar
      const current = existing.value;
      const updated = { ...current, ...config };
      existing.next(updated);
      return existing.asObservable();
    } else {
      // Crear nuevo
      const subject = new BehaviorSubject<StepperConfig>({
        currentStepIndex: 0,
        linear: true,
        showNavigation: true,
        showProgress: true,
        allowSkip: false,
        ...config
      });
      
      this.steppers.set(config.id, subject);
      return subject.asObservable();
    }
  }

  /**
   * Navega a un paso específico
   */
  goToStep(stepperId: string, stepIdOrIndex: string | number): boolean {
    const subject = this.steppers.get(stepperId);
    if (!subject) return false;

    const current = subject.value;
    let targetIndex: number;

    if (typeof stepIdOrIndex === 'number') {
      targetIndex = stepIdOrIndex;
    } else {
      targetIndex = current.steps.findIndex(step => step.id === stepIdOrIndex);
    }

    if (targetIndex < 0 || targetIndex >= current.steps.length) {
      return false;
    }

    const targetStep = current.steps[targetIndex];
    
    // Validar si es stepper lineal y el paso está habilitado
    if (current.linear && targetStep.status === 'disabled') {
      return false;
    }

    // Ejecutar callback si existe
    if (current.onStepChange) {
      const previousStep = current.steps[current.currentStepIndex!];
      current.onStepChange(targetStep, previousStep);
    }

    // Actualizar estados
    const updatedSteps = current.steps.map((step, index) => ({
      ...step,
      status: (index === targetIndex ? 'active' : 
              index < targetIndex ? 'completed' : 'pending') as StepperStep['status']
    }));

    const updatedConfig: StepperConfig = {
      ...current,
      steps: updatedSteps,
      currentStepIndex: targetIndex
    };

    subject.next(updatedConfig);
    return true;
  }

  /**
   * Avanza al siguiente paso
   */
  nextStep(stepperId: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const subject = this.steppers.get(stepperId);
      if (!subject) {
        resolve(false);
        return;
      }

      const current = subject.value;
      const currentIndex = current.currentStepIndex || 0;
      
      if (currentIndex >= current.steps.length - 1) {
        // Último paso - completar stepper
        if (current.onComplete) {
          current.onComplete(current.steps);
        }
        resolve(false);
        return;
      }

      const currentStep = current.steps[currentIndex];
      
      // Validar paso actual si tiene validador
      if (currentStep.validator) {
        try {
          const isValid = await Promise.resolve(currentStep.validator());
          if (!isValid) {
            currentStep.status = 'error';
            subject.next({ ...current });
            resolve(false);
            return;
          }
        } catch (error) {
          currentStep.status = 'error';
          subject.next({ ...current });
          resolve(false);
          return;
        }
      }

      // Marcar como completado y avanzar
      current.steps[currentIndex].status = 'completed';
      this.goToStep(stepperId, currentIndex + 1);
      resolve(true);
    });
  }

  /**
   * Retrocede al paso anterior
   */
  previousStep(stepperId: string): boolean {
    const subject = this.steppers.get(stepperId);
    if (!subject) return false;

    const current = subject.value;
    const currentIndex = current.currentStepIndex || 0;
    
    if (currentIndex <= 0) return false;

    // En steppers lineales, siempre se puede retroceder
    return this.goToStep(stepperId, currentIndex - 1);
  }

  /**
   * Actualiza el estado de un paso específico
   */
  updateStepStatus(stepperId: string, stepId: string, status: StepperStep['status']): boolean {
    const subject = this.steppers.get(stepperId);
    if (!subject) return false;

    const current = subject.value;
    const stepIndex = current.steps.findIndex(step => step.id === stepId);
    
    if (stepIndex === -1) return false;

    const updatedSteps = [...current.steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], status };

    subject.next({ ...current, steps: updatedSteps });
    return true;
  }

  /**
   * Obtiene datos del stepper
   */
  getStepperData(stepperId: string): any {
    const subject = this.steppers.get(stepperId);
    if (!subject) return null;

    const current = subject.value;
    return current.steps.reduce((acc, step) => {
      if (step.data) {
        acc[step.id] = step.data;
      }
      return acc;
    }, {} as any);
  }

  /**
   * Resetea el stepper
   */
  resetStepper(stepperId: string): boolean {
    const subject = this.steppers.get(stepperId);
    if (!subject) return false;

    const current = subject.value;
    const resetSteps = current.steps.map((step, index) => ({
      ...step,
      status: (index === 0 ? 'active' : 'pending') as StepperStep['status'],
      data: undefined
    }));

    subject.next({
      ...current,
      steps: resetSteps,
      currentStepIndex: 0
    });

    return true;
  }

  /**
   * Destruye un stepper
   */
  destroyStepper(stepperId: string): boolean {
    return this.steppers.delete(stepperId);
  }

  /**
   * Verifica si todos los pasos están completados
   */
  isComplete(stepperId: string): boolean {
    const subject = this.steppers.get(stepperId);
    if (!subject) return false;

    const current = subject.value;
    return current.steps.every(step => step.status === 'completed');
  }
}