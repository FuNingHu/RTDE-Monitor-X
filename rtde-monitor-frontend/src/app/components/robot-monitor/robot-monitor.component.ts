import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { OperatorScreen, OperatorScreenPresenter, OperatorScreenPresenterAPI, RobotSettings } from '@universal-robots/contribution-api';
import { TranslateService } from '@ngx-translate/core';
import { MONITOR_PAGES, MonitorPageId, monitorPageId } from '../../constant';
import { BoardLayout, RegisterWrite, RtdeSnapshot } from '../rtde-snapshot';
import { RtdeSession, RtdeStreamService } from '../rtde-stream.service';

interface SignalOperatorScreen extends Omit<OperatorScreenPresenter, 'operatorScreen' | 'robotSettings' | 'presenterAPI'> {
    operatorScreen: ReturnType<typeof input<OperatorScreen | undefined>>;
    robotSettings: ReturnType<typeof input<RobotSettings | undefined>>;
    presenterAPI: ReturnType<typeof input<OperatorScreenPresenterAPI | undefined>>;
}

@Component({
    templateUrl: './robot-monitor.component.html',
    styleUrls: ['./robot-monitor.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RobotMonitorComponent implements SignalOperatorScreen {
    private readonly translate = inject(TranslateService);
    private readonly streams = inject(RtdeStreamService);

    readonly operatorScreen = input<OperatorScreen | undefined>();
    readonly robotSettings = input<RobotSettings | undefined>();
    readonly presenterAPI = input<OperatorScreenPresenterAPI | undefined>();
    readonly snapshot = signal<RtdeSnapshot | null>(null);
    readonly savedLayout = signal<BoardLayout | null>(null);
    readonly view = computed<MonitorPageId>(() => monitorPageId(this.operatorScreen()?.parameters?.page));
    readonly activePage = signal<MonitorPageId | null>(null);
    readonly layout = computed(() => (this.activePage() === this.view() ? this.savedLayout() : null));
    readonly writable = computed(() => MONITOR_PAGES.find((page) => page.id === this.view())?.writable === true);
    private session: RtdeSession | null = null;
    private sessionPage: MonitorPageId | null = null;

    readonly saveLayout = (layout: BoardLayout): void => {
        if (this.sessionPage !== this.view()) {
            return;
        }
        this.session?.saveLayout(layout);
    };

    readonly setFrequency = (frequency: number): void => {
        if (this.sessionPage !== this.view()) {
            return;
        }
        this.session?.setFrequency(frequency);
    };

    readonly writeRegister = (command: RegisterWrite): Promise<void> => {
        const session = this.sessionPage === this.view() ? this.session : null;
        if (!session) {
            return Promise.reject(new Error(this.translate.instant('write.offline')));
        }
        return session.write(command).catch((error: unknown) => {
            const code = error instanceof Error ? error.message : '';
            if (code === 'offline') {
                throw new Error(this.translate.instant('write.offline'));
            }
            if (code === 'timeout') {
                throw new Error(this.translate.instant('write.timeout'));
            }
            if (!code || code === 'write-failed') {
                throw new Error(this.translate.instant('write.failed'));
            }
            throw error instanceof Error ? error : new Error(this.translate.instant('write.failed'));
        });
    };

    private readonly language = effect(() => {
        const language = this.robotSettings()?.language;
        if (language) {
            this.translate.use(language);
        }
        this.translate.setDefaultLang('en');
    });

    private readonly connection = effect((onCleanup) => {
        const api = this.presenterAPI();
        const page = this.view();
        if (!api) {
            return;
        }
        this.snapshot.set(null);
        this.savedLayout.set(null);
        this.activePage.set(page);
        const session = this.streams.open(
            api,
            page,
            (snapshot) => {
                if (this.view() === page) {
                    this.snapshot.set(snapshot);
                }
            },
            (layout) => {
                if (this.view() === page) {
                    this.savedLayout.set(layout);
                }
            },
        );
        this.session = session;
        this.sessionPage = page;
        onCleanup(() => {
            session.close();
            if (this.session === session) {
                this.session = null;
                this.sessionPage = null;
                this.activePage.set(null);
            }
        });
    });
}
