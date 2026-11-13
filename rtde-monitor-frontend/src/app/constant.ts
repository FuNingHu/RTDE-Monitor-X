/** Product parameters for the RTDE monitor. Import these instead of repeating the values. */

export const FREQUENCY_MIN_HZ = 5;
export const FREQUENCY_MAX_HZ = 100;
export const FREQUENCY_DEFAULT_HZ = 20;
export const FREQUENCY_STEP_HZ = 1;
export const STATUS_BLINK_HZ = 0.3;

export const FREQUENCY_CHOICES: readonly number[] = Array.from(
    { length: (FREQUENCY_MAX_HZ - FREQUENCY_MIN_HZ) / FREQUENCY_STEP_HZ + 1 },
    (_, index) => FREQUENCY_MIN_HZ + index * FREQUENCY_STEP_HZ,
);

export type MonitorPageId = 'registers' | 'signals';

export interface MonitorPage {
    id: MonitorPageId;
    labelKey: string;
    writable: boolean;
}

/** Pages chosen from the Application Operator Screen configuration. The first page is the default. */
export const MONITOR_PAGES: readonly MonitorPage[] = [
    { id: 'registers', labelKey: 'view.registers', writable: true },
    { id: 'signals', labelKey: 'view.signals', writable: false },
];

export function monitorPageId(value: unknown): MonitorPageId {
    return MONITOR_PAGES.some((page) => page.id === value) ? (value as MonitorPageId) : MONITOR_PAGES[0].id;
}

export const LAYOUT_STORAGE_PREFIX = 'rtde-monitor.layout.';
export const LAYOUT_COLUMN_COUNT = 8;
export const LAYOUT_FOCUS_COLUMNS = 2;
/** A1 and A2 fill the first two columns. Later columns have an A and a B row, through B8. */
export const LAYOUT_SLOTS: readonly string[] = Array.from({ length: LAYOUT_COLUMN_COUNT }, (_, index) => {
    const column = index + 1;
    return column <= LAYOUT_FOCUS_COLUMNS ? [`A${column}`] : [`A${column}`, `B${column}`];
}).flat();

export const RECONNECT_DELAY_MS = 2000;
export const WRITE_TIMEOUT_MS = 5000;
export const SCROLL_SAVE_DELAY_MS = 300;

export const DRAG_SETTLE_MS = 180;
export const DRAG_FINISH_MS = 190;
export const DRAG_EDGE_PX = 36;
export const DRAG_EDGE_STEP_PX = 14;
export const SCROLL_RESTORE_ATTEMPTS = 8;
export const SCROLL_RESTORE_TOLERANCE_PX = 2;

export const DISPLAY_SIGNIFICANT_DIGITS = 4;

export const INT32_MIN = -2147483648;
export const INT32_MAX = 2147483647;
export const ENTRY_MAX_LENGTH = 16;
