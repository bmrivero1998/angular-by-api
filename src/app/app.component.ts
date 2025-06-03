import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ApiDrivenContent,
  DynamicClickPayload,
} from './interfaces/DynamicContent.interface';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DynamicViewerComponent } from './components/dynamic-viewer/dynamic-viewer.component';
import { CommonModule } from '@angular/common';
import { DynamicContentService } from './services/dynamic-content.service';
import { FormGroup } from '@angular/forms';

export interface DisplayableInAppComponent extends ApiDrivenContent {
  // Hereda de ApiDrivenContent
  safeHtml: SafeHtml;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DynamicViewerComponent, CommonModule], // DynamicViewerComponent importado aquí
  templateUrl: './app.component.html', // Ver abajo
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  public displayableItems: DisplayableInAppComponent[] = [];
  public parentForm: FormGroup = new FormGroup({});

  constructor(
    private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadDynamicContent();
    this.parentFormValidation();
  }

  private parentFormValidation(): void {
    this.parentForm.valueChanges.subscribe(() => {
      const userRegistrationForm = this.parentForm.get(
        'userRegistration',
      ) as FormGroup;
      if (userRegistrationForm) {
        const passwordControl = userRegistrationForm.get('password'); // Es 'password', no 'passwordValue'
        const confirmPasswordControl =
          userRegistrationForm.get('confirmPassword');
        const emailControl = userRegistrationForm.get('email');
        const fullNameControl = userRegistrationForm.get('fullName');

        if (passwordControl && confirmPasswordControl) {
          if (passwordControl.value === confirmPasswordControl.value) {
            if (confirmPasswordControl.hasError('passwordMismatch')) {
              confirmPasswordControl.setErrors(null, { emitEvent: false });
            }
          } else {
            if (!confirmPasswordControl.hasError('passwordMismatch')) {
              confirmPasswordControl.setErrors(
                { ...confirmPasswordControl.errors, passwordMismatch: true },
                { emitEvent: false },
              );
            }
          }
        }

        if (fullNameControl && emailControl) {
          if (!fullNameControl.value) {
            if (emailControl.enabled) {
              emailControl.disable();
            }
          } else {
            if (emailControl.disabled) {
              emailControl.setValue('carlos.slim@correo.com');
              emailControl.enable();
            }
          }
        }
      }
      const postalCodeForm = this.parentForm.get(
        'lookupPostalCodeForm',
      ) as FormGroup;
      if (postalCodeForm) {
        const postalCodeControl = postalCodeForm.get('postalCode');
        if (postalCodeControl) {
        }
      }
    });
  }

  private loadDynamicContent(): void {
    this.dcs.getContent().subscribe({
      next: (apiResponseData: ApiDrivenContent[]) => {
        if (!apiResponseData || apiResponseData.length === 0) {
          this.displayableItems = [];
          this.cdr.detectChanges();
          return;
        }

        this.displayableItems = apiResponseData.map((item) => ({
          ...item,
          safeHtml: this.sanitizer.bypassSecurityTrustHtml(item.plantillaHTML),
        }));

        this.cdr.detectChanges();
      },
      error: (err) => {
        /* ... manejo de error ... */
      },
    });
  }
  handleViewerFormSubmission(payload: { formId?: string; data: any }): void {
    console.log(
      `AppComponent: Formulario ${payload.formId} enviado desde viewer con datos:`,
      payload.data,
    );
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    if (
      payload.action === 'clearRegistrationForm' &&
      payload.sourceId === 'userRegistration'
    ) {
      this.parentForm.get('userRegistration')?.reset();
    }
  }

  ngOnDestroy() {}
}
