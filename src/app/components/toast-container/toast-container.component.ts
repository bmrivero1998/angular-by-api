import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { Subscription } from 'rxjs';
import { Toast, ToastService } from '../../services/toast.service';

declare var bootstrap: any;

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, NgClass],
  templateUrl: './toast-container.component.html',
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private toastSubscription!: Subscription;

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.toastSubscription = this.toastService.toast$.subscribe((toast) => {
      this.toasts.push(toast);
      setTimeout(() => this.showNewestToast(), 0);
    });
  }

  private showNewestToast(): void {
    const toastElements = document.querySelectorAll('.toast');
    const newToastEl = toastElements[toastElements.length - 1];

    if (newToastEl) {
      const bsToast = new bootstrap.Toast(newToastEl);
      newToastEl.addEventListener('hidden.bs.toast', () => {
        this.toasts.shift();
      });
      bsToast.show();
    }
  }

  remove(index: number) {
    this.toasts.splice(index, 1);
  }

  ngOnDestroy(): void {
    if (this.toastSubscription) {
      this.toastSubscription.unsubscribe();
    }
  }
}
