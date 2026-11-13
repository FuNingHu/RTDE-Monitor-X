import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ENTRY_MAX_LENGTH, INT32_MAX, INT32_MIN } from '../../constant';

@Component({
    selector: 'app-rtde-keypad',
    templateUrl: './rtde-keypad.component.html',
    styleUrls: ['./rtde-keypad.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RtdeKeypadComponent {
    readonly kind = input.required<'int' | 'double'>();
    readonly address = input.required<number>();
    readonly initial = input<number | null>(null);
    readonly error = input('');
    readonly busy = input(false);
    readonly dismiss = output<void>();
    readonly confirmValue = output<number>();

    readonly digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    readonly draft = signal('');
    private readonly fresh = signal(true);

    readonly parsed = computed(() => this.parse(this.draft(), this.kind()));
    readonly canConfirm = computed(() => this.parsed() !== null && !this.busy());

    private readonly seed = effect(() => {
        this.draft.set(this.seedText(this.initial(), this.kind()));
        this.fresh.set(true);
    });

    typeDigit(key: string): void {
        if (this.busy()) {
            return;
        }
        if (this.fresh()) {
            this.draft.set(key);
            this.fresh.set(false);
            return;
        }
        const current = this.draft();
        const next = current === '0' ? key : current === '-0' ? `-${key}` : `${current}${key}`;
        if (next.length <= ENTRY_MAX_LENGTH) {
            this.draft.set(next);
        }
    }

    typeDecimal(): void {
        if (this.busy() || this.kind() === 'int') {
            return;
        }
        if (this.fresh()) {
            this.draft.set('0.');
            this.fresh.set(false);
            return;
        }
        const current = this.draft();
        if (current.includes('.')) {
            return;
        }
        if (current === '' || current === '-') {
            this.draft.set(`${current}0.`);
            return;
        }
        this.draft.set(`${current}.`);
    }

    backspace(): void {
        if (this.busy()) {
            return;
        }
        if (this.fresh()) {
            this.draft.set('');
            this.fresh.set(false);
            return;
        }
        this.draft.set(this.draft().slice(0, -1));
    }

    toggleSign(): void {
        if (this.busy()) {
            return;
        }
        const current = this.draft();
        if (current.startsWith('-')) {
            this.draft.set(current.slice(1));
        } else {
            this.draft.set(current ? `-${current}` : '-');
        }
        this.fresh.set(false);
    }

    confirm(): void {
        const value = this.parsed();
        if (value === null || this.busy()) {
            return;
        }
        this.confirmValue.emit(value);
    }

    private seedText(value: number | null, kind: 'int' | 'double'): string {
        if (value === null || !Number.isFinite(value)) {
            return '';
        }
        if (kind === 'int') {
            return String(Math.trunc(value));
        }
        return String(value);
    }

    private parse(text: string, kind: 'int' | 'double'): number | null {
        if (kind === 'int') {
            if (!/^-?\d+$/.test(text)) {
                return null;
            }
            const value = Number(text);
            if (!Number.isSafeInteger(value) || value < INT32_MIN || value > INT32_MAX) {
                return null;
            }
            return value;
        }
        if (!/^-?\d+(\.\d+)?$/.test(text)) {
            return null;
        }
        const value = Number(text);
        return Number.isFinite(value) ? value : null;
    }
}
