import { DoBootstrap, Injector, NgModule } from '@angular/core';
import { UIAngularComponentsModule } from '@universal-robots/ui-angular-components';
import { BrowserModule } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { HttpBackend, HttpClientModule } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { MultiTranslateHttpLoader } from 'ngx-translate-multi-http-loader';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PATH } from '../generated/contribution-constants';
import { RtdeBoardComponent } from './components/rtde-board/rtde-board.component';
import { RtdeFrequencyDialogComponent } from './components/rtde-frequency-dialog/rtde-frequency-dialog.component';
import { RtdeKeypadComponent } from './components/rtde-keypad/rtde-keypad.component';
import { RobotMonitorComponent } from './components/robot-monitor/robot-monitor.component';
import { RobotMonitorConfigComponent } from './components/robot-monitor-config/robot-monitor-config.component';

export const httpLoaderFactory = (http: HttpBackend) =>
    new MultiTranslateHttpLoader(http, [
        { prefix: PATH + '/assets/i18n/', suffix: '.json' },
        { prefix: './ui/assets/i18n/', suffix: '.json' },
    ]);

@NgModule({
    declarations: [RtdeBoardComponent, RtdeFrequencyDialogComponent, RtdeKeypadComponent, RobotMonitorComponent, RobotMonitorConfigComponent],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        UIAngularComponentsModule,
        HttpClientModule,
        TranslateModule.forRoot({
            defaultLanguage: 'en',
            loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpBackend] },
            useDefaultLang: true,
        }),
    ],
    providers: [],
})
export class AppModule implements DoBootstrap {
    constructor(private injector: Injector) {}

    ngDoBootstrap() {
        const monitor = createCustomElement(RobotMonitorComponent, { injector: this.injector });
        customElements.define('funh-rtde-monitor-robot-monitor', monitor);
        const monitorConfig = createCustomElement(RobotMonitorConfigComponent, { injector: this.injector });
        customElements.define('funh-rtde-monitor-robot-monitor-config', monitorConfig);
    }

    // This function is never called, because we don't want to actually use the workers, just tell webpack about them
    registerWorkersWithWebPack() {
        new Worker(
            new URL('./components/robot-monitor/robot-monitor.behavior.worker.ts' /* webpackChunkName: "robot-monitor.worker" */, import.meta.url),
            {
                name: 'robot-monitor',
                type: 'module',
            },
        );
    }
}
