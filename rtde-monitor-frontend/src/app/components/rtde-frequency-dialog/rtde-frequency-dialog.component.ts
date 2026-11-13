import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, signal, ViewChild } from '@angular/core';
import { FREQUENCY_CHOICES, FREQUENCY_DEFAULT_HZ, FREQUENCY_MAX_HZ, FREQUENCY_MIN_HZ, FREQUENCY_STEP_HZ } from '../../constant';

@Component({
    selector: 'app-rtde-frequency-dialog',
    templateUrl: './rtde-frequency-dialog.component.html',
    styleUrls: ['./rtde-frequency-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RtdeFrequencyDialogComponent implements AfterViewInit {
    readonly value = input(FREQUENCY_DEFAULT_HZ);
    readonly dismiss = output<void>();
    readonly confirmFrequency = output<number>();
    readonly choices = FREQUENCY_CHOICES;
    readonly draft = signal(FREQUENCY_DEFAULT_HZ);
    @ViewChild('wheel') private wheelRef?: ElementRef<HTMLElement>;

    ngAfterViewInit(): void {
        this.alignWheel(0);
    }

    onWheelScroll(): void {
        const wheel = this.wheelRef?.nativeElement;
        const height = this.itemHeight();
        if (!wheel || height <= 0) {
            return;
        }
        const index = Math.round(wheel.scrollTop / height);
        this.draft.set(this.clamped(FREQUENCY_MIN_HZ + index * FREQUENCY_STEP_HZ));
    }

    moveTo(hz: number): void {
        const wheel = this.wheelRef?.nativeElement;
        const height = this.itemHeight();
        const next = this.clamped(hz);
        this.draft.set(next);
        if (!wheel || height <= 0) {
            return;
        }
        wheel.scrollTop = ((next - FREQUENCY_MIN_HZ) / FREQUENCY_STEP_HZ) * height;
    }

    confirm(): void {
        this.confirmFrequency.emit(this.draft());
    }

    private alignWheel(attempt: number): void {
        const next = this.clamped(this.value());
        this.draft.set(next);
        const wheel = this.wheelRef?.nativeElement;
        const height = this.itemHeight();
        if (!wheel || height <= 0) {
            if (attempt < 4) {
                requestAnimationFrame(() => this.alignWheel(attempt + 1));
            }
            return;
        }
        wheel.scrollTop = ((next - FREQUENCY_MIN_HZ) / FREQUENCY_STEP_HZ) * height;
    }

    private itemHeight(): number {
        const item = this.wheelRef?.nativeElement.querySelector('.wheel-item');
        return item instanceof HTMLElement ? item.getBoundingClientRect().height : 0;
    }

    private clamped(hz: number): number {
        if (!Number.isFinite(hz)) {
            return FREQUENCY_DEFAULT_HZ;
        }
        const stepped = FREQUENCY_MIN_HZ + Math.round((hz - FREQUENCY_MIN_HZ) / FREQUENCY_STEP_HZ) * FREQUENCY_STEP_HZ;
        return Math.min(FREQUENCY_MAX_HZ, Math.max(FREQUENCY_MIN_HZ, stepped));
    }
}
