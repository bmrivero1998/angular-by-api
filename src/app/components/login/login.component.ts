import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { DisplayableInAppComponent } from '../../app.component';
import {
  ApiDrivenContent,
  DynamicClickPayload,
} from '../../interfaces/DynamicContent.interface';
import { DynamicContentService } from '../../services/dynamic-content.service';
import { DynamicViewerComponent } from '../dynamic-viewer/dynamic-viewer.component';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-login',
  imports: [DynamicViewerComponent, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit, OnDestroy {
  public displayableItems: DisplayableInAppComponent[] = [];
  public parentForm: FormGroup = new FormGroup({});

  constructor(
    private dcs: DynamicContentService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private readonly router: Router,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.loadDynamicContent();
  }

  private loadDynamicContent(): void {
    this.dcs.getContent('login').subscribe({
      next: (apiResponseData: ApiDrivenContent[]) => {
        if (!apiResponseData || apiResponseData.length === 0) {
          this.displayableItems = [];
          this.cdr.detectChanges();
          return;
        }

        this.displayableItems = apiResponseData.map((item) => ({
          ...item,
          safeHtml: this.sanitizer.bypassSecurityTrustHtml(
            item.htmlComponent || ''
          ),
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
      payload.data
    );

    this.http
      .get('https://jsonplaceholder.typicode.com/todos/1?_delay=2000')
      .subscribe((response) => {
        console.log('Respuesta recibida:', response);
        this.router.navigate(['/principal']);
      });
  }

  handleViewerActionClick(payload: DynamicClickPayload): void {
    console.log(
      `AppComponent: Acción ${payload.action} clickeada desde viewer con datos:`,
      payload
    );
  }

  ngOnDestroy() {}
}
