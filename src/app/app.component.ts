import { Component, OnInit, OnDestroy } from '@angular/core';
import { DynamicContentInterface } from './interfaces/DynamicContent.interface';
import { DynamicContentService } from './services/dynamic-content.service';
import { DynamicInyectCssService } from './services/dynamic-inyect-css.service';
import { DynamicViewerComponent } from './components/dynamic-viewer/dynamic-viewer.component';

@Component({
  selector: 'app-root',

  standalone: true, 
  imports: [ DynamicViewerComponent ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy { 

  public data: DynamicContentInterface | null = null;
  public htmlStringToDisplay: string = '';
  private dynamicStyleId: string | null = null;

  constructor(
    private readonly dcs: DynamicContentService,
    private readonly dyc: DynamicInyectCssService
  ) {}

  ngOnInit() {
    this.dcs.getContent().subscribe((apiResponseData) => {
      this.data = apiResponseData;
      this.htmlStringToDisplay = apiResponseData.plantillaHTML; 

      if (apiResponseData.css && apiResponseData.configuracion) {
        this.dynamicStyleId = this.dyc.generateStyleId(apiResponseData.configuracion);
        this.dyc.injectCss(apiResponseData.css, this.dynamicStyleId);
      }
    });
  }

  ngOnDestroy() { 
    if (this.dynamicStyleId) {
      this.dyc.removeCss(this.dynamicStyleId);
    }
  }
}