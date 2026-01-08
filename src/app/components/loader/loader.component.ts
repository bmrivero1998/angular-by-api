import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // Necesario para *ngIf y async pipe
import { LoaderService } from '../../../../projects/dynamic-forms-engine/src/lib/services/loader.service';


@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.css'],
})
export class LoaderComponent {
  constructor(public loaderService: LoaderService) {}
}
