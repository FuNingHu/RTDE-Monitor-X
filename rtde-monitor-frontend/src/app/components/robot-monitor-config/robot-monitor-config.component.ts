import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { OperatorScreen, OperatorScreenConfigurationPresenter, OperatorScreenPresenterAPI, RobotSettings } from '@universal-robots/contribution-api';
import { TranslateService } from '@ngx-translate/core';
import { MONITOR_PAGES, MonitorPageId, monitorPageId } from '../../constant';

interface SignalConfiguration extends Omit<OperatorScreenConfigurationPresenter, 'operatorScreen' | 'robotSettings' | 'presenterAPI'> {
    operatorScreen: ReturnType<typeof input<OperatorScreen | undefined>>;
    robotSettings: ReturnType<typeof input<RobotSettings | undefined>>;
    presenterAPI: ReturnType<typeof input<OperatorScreenPresenterAPI | undefined>>;
}

@Component({
    templateUrl: './robot-monitor-config.component.html',
    styleUrls: ['./robot-monitor-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RobotMonitorConfigComponent implements SignalConfiguration {
    private readonly translate = inject(TranslateService);

    readonly pages = MONITOR_PAGES;
    readonly operatorScreen = input<OperatorScreen | undefined>();
    readonly robotSettings = input<RobotSettings | undefined>();
    readonly presenterAPI = input<OperatorScreenPresenterAPI | undefined>();
    readonly selected = computed(() => monitorPageId(this.operatorScreen()?.parameters?.page));
    readonly selectedIndex = computed(() => Math.max(0, this.pages.findIndex((page) => page.id === this.selected())));

    select(id: MonitorPageId): void {
        const screen = this.operatorScreen();
        const api = this.presenterAPI();
        if (!screen || !api || screen.parameters?.page === id) {
            return;
        }
        void api.operatorScreenService.updateOperatorScreen({
            ...screen,
            parameters: { ...(screen.parameters ?? {}), page: id },
        });
    }

    private readonly language = effect(() => {
        const language = this.robotSettings()?.language;
        if (language) {
            this.translate.use(language);
        }
        this.translate.setDefaultLang('en');
    });
}
