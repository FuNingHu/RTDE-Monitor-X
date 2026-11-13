import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import {
    DISPLAY_SIGNIFICANT_DIGITS,
    DRAG_EDGE_PX,
    DRAG_EDGE_STEP_PX,
    DRAG_FINISH_MS,
    DRAG_SETTLE_MS,
    LAYOUT_COLUMN_COUNT,
    LAYOUT_FOCUS_COLUMNS,
    LAYOUT_SLOTS,
    FREQUENCY_DEFAULT_HZ,
    FREQUENCY_MAX_HZ,
    FREQUENCY_MIN_HZ,
    STATUS_BLINK_HZ,
    SCROLL_RESTORE_ATTEMPTS,
    SCROLL_RESTORE_TOLERANCE_PX,
    SCROLL_SAVE_DELAY_MS,
} from '../../constant';
import { BoardLayout, RegisterWrite, RtdeGroup, RtdeItem, RtdeSnapshot, emptyBoardLayout, readBoardLayout } from '../rtde-snapshot';

interface NumberEditor {
    kind: 'int' | 'double';
    address: number;
    initial: number | null;
}

interface BoardSlot {
    id: string;
    column: number;
    focus: boolean;
    group: RtdeGroup | null;
}

interface BoardColumn {
    number: number;
    focus: boolean;
    slots: BoardSlot[];
}

@Component({
    selector: 'app-rtde-board',
    templateUrl: './rtde-board.component.html',
    styleUrls: ['./rtde-board.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RtdeBoardComponent implements OnDestroy {
    private readonly host = inject(ElementRef<HTMLElement>);
    readonly snapshot = input<RtdeSnapshot | null>(null);
    readonly registerWriter = input<((command: RegisterWrite) => Promise<void>) | undefined>(undefined);
    readonly layoutKey = input('board');
    readonly savedLayout = input<BoardLayout | null>(null);
    readonly layoutSaver = input<((layout: BoardLayout) => void) | undefined>(undefined);
    readonly frequencySetter = input<((frequency: number) => void) | undefined>(undefined);
    readonly frequencyOpen = signal(false);
    readonly screenTitleKey = computed(() => (this.layoutKey() === 'signals' ? 'screen.signals' : 'screen.registers'));
    readonly statusBlinkPeriod = 1 / STATUS_BLINK_HZ;
    readonly query = signal('');
    readonly order = signal<string[]>([]);
    readonly scrollTarget = signal(0);
    readonly viewportScroll = signal(0);
    private readonly cardScroll = signal<Record<string, number>>({});
    readonly draggingId = signal<string | null>(null);
    @ViewChild('modules') private modulesRef?: ElementRef<HTMLElement>;
    private ghost: HTMLElement | null = null;
    private dragPointer = -1;
    private grabOffsetX = 0;
    private grabOffsetY = 0;
    private hoverId: string | null = null;
    private originIds: string[] = [];
    private settleTimer: ReturnType<typeof setTimeout> | undefined;
    private scrollSaveTimer: ReturnType<typeof setTimeout> | undefined;
    private scrollRestored = false;
    private scrollRestoreAttempts = 0;
    readonly editor = signal<NumberEditor | null>(null);
    readonly editorError = signal('');
    readonly editorBusy = signal(false);
    readonly writeError = signal('');
    private readonly openBitWords = signal<ReadonlySet<string>>(new Set());

    readonly visibleGroups = computed(() => {
        const groups = this.snapshot()?.groups ?? [];
        const query = this.query().trim().toLowerCase();
        if (!query) {
            return groups;
        }
        return groups
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => `${item.label} ${item.name}`.toLowerCase().includes(query)),
            }))
            .filter((group) => group.items.length > 0);
    });

    readonly filtering = computed(() => this.query().trim().length > 0);

    readonly layoutChanged = computed(() => {
        const groups = this.snapshot()?.groups ?? [];
        const current = this.pack(groups, this.order());
        const natural = this.pack(groups, []);
        const orderChanged = current.some((id, index) => id !== natural[index]);
        const cardChanged = Object.values(this.cardScroll()).some((top) => top > 1);
        return orderChanged || this.viewportScroll() > 1 || cardChanged;
    });

    readonly columns = computed((): BoardColumn[] => {
        const ids = this.pack(this.snapshot()?.groups ?? [], this.order());
        const visible = new Map(this.visibleGroups().map((group) => [group.id, group]));
        const slots = LAYOUT_SLOTS.map((id, index) => {
            const column = Number(id.slice(1));
            const groupId = ids[index] ?? '';
            return {
                id,
                column,
                focus: column <= LAYOUT_FOCUS_COLUMNS,
                group: visible.get(groupId) ?? null,
            };
        });
        return Array.from({ length: LAYOUT_COLUMN_COUNT }, (_, index) => {
            const number = index + 1;
            return {
                number,
                focus: number <= LAYOUT_FOCUS_COLUMNS,
                slots: slots.filter((slot) => slot.column === number),
            };
        });
    });

    private readonly restoredOrder = effect(() => {
        const key = this.layoutKey();
        const remote = this.savedLayout();
        if (this.dragPointer !== -1) {
            return;
        }
        const layout = remote ?? this.readLocal(key);
        const cardsChanged = untracked(() => !this.sameCards(layout.cards));
        this.order.set([...layout.order]);
        if (cardsChanged) {
            this.cardScroll.set({ ...layout.cards });
        }
        if (remote) {
            this.writeLocal(key, layout);
        }
        if (this.scrollRestored && layout.scroll === this.scrollTarget() && !cardsChanged) {
            return;
        }
        this.scrollTarget.set(layout.scroll);
        this.viewportScroll.set(layout.scroll);
        this.scrollRestoreAttempts = 0;
        this.scrollRestored = false;
    });

    private readonly restoreScroll = afterRenderEffect(() => {
        const target = this.scrollTarget();
        const cards = this.cardScroll();
        const ready = (this.snapshot()?.groups.length ?? 0) > 0;
        const scroller = this.modulesRef?.nativeElement;
        if (!ready || !scroller || this.scrollRestored || this.dragPointer !== -1) {
            return;
        }
        scroller.scrollLeft = target;
        const cardsApplied = this.applyCardScrolls(cards);
        this.scrollRestoreAttempts += 1;
        const applied = (target <= 1 || Math.abs(scroller.scrollLeft - target) <= SCROLL_RESTORE_TOLERANCE_PX) && cardsApplied;
        if (applied || this.scrollRestoreAttempts > SCROLL_RESTORE_ATTEMPTS) {
            this.scrollRestored = true;
        }
    });

    resetLayout(): void {
        if (this.draggingId() || this.settleTimer) {
            return;
        }
        this.clearScrollSave();
        this.order.set([]);
        this.cardScroll.set({});
        this.scrollTarget.set(0);
        this.scrollRestoreAttempts = 0;
        this.scrollRestored = true;
        if (this.modulesRef) {
            this.modulesRef.nativeElement.scrollLeft = 0;
            this.modulesRef.nativeElement.querySelectorAll('.module-body').forEach((node) => {
                if (node instanceof HTMLElement) {
                    node.scrollTop = 0;
                }
            });
        }
        this.persist([], 0);
    }

    onCardScroll(id: string, event: Event): void {
        if (!this.scrollRestored || this.dragPointer !== -1) {
            return;
        }
        const top = Math.max(0, Math.round((event.target as HTMLElement).scrollTop));
        const stored = this.cardScroll()[id] ?? 0;
        if (stored === (top > 1 ? top : 0)) {
            return;
        }
        this.cardScroll.update((current) => {
            const next = { ...current };
            if (top > 1) {
                next[id] = top;
            } else {
                delete next[id];
            }
            return next;
        });
        this.scheduleScrollSave();
    }

    onStageScroll(): void {
        if (!this.scrollRestored || this.dragPointer !== -1) {
            return;
        }
        const left = this.currentScroll();
        this.viewportScroll.set(left);
        this.scheduleScrollSave();
    }

    displayedFrequency(): number {
        const frequency = this.snapshot()?.frequency ?? 0;
        if (frequency >= FREQUENCY_MIN_HZ && frequency <= FREQUENCY_MAX_HZ) {
            return frequency;
        }
        return FREQUENCY_DEFAULT_HZ;
    }

    applyFrequency(frequency: number): void {
        this.frequencySetter()?.(frequency);
        this.frequencyOpen.set(false);
    }

    onQueryInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.query.set(target.value);
    }

    clearQuery(): void {
        this.query.set('');
    }

    canWrite(item: RtdeItem): boolean {
        return this.registerWriter() !== undefined && item.writable === true && typeof item.address === 'number';
    }

    onBit(item: RtdeItem): void {
        if (!this.canWrite(item) || item.kind !== 'bit' || typeof item.address !== 'number' || this.editorBusy()) {
            return;
        }
        void this.submit({ kind: 'bit', address: item.address, value: this.isOn(item) ? 0 : 1 });
    }

    onNumber(item: RtdeItem): void {
        if (!this.canWrite(item) || (item.kind !== 'int' && item.kind !== 'double') || typeof item.address !== 'number') {
            return;
        }
        this.editor.set({
            kind: item.kind,
            address: item.address,
            initial: typeof item.value === 'number' ? item.value : null,
        });
        this.editorError.set('');
    }

    closeEditor(): void {
        if (this.editorBusy()) {
            return;
        }
        this.editor.set(null);
        this.editorError.set('');
    }

    onConfirm(value: number): void {
        const editor = this.editor();
        if (!editor) {
            return;
        }
        void this.submit({ kind: editor.kind, address: editor.address, value });
    }

    isOn(item: RtdeItem): boolean {
        return item.value === 1 || item.value === true;
    }

    isVector(item: RtdeItem): boolean {
        return Array.isArray(item.value);
    }

    vectorParts(item: RtdeItem): string[] {
        if (!Array.isArray(item.value)) {
            return [];
        }
        return item.value.map((entry) => (this.isMeasured(item) ? this.formatMeasured(item, entry) : this.formatNumber(entry)));
    }

    isBitWord(item: RtdeItem): boolean {
        return item.name.endsWith('_bits');
    }

    bitWordOpen(name: string): boolean {
        return this.openBitWords().has(name);
    }

    toggleBitWord(name: string): void {
        const next = new Set(this.openBitWords());
        if (next.has(name)) {
            next.delete(name);
        } else {
            next.add(name);
        }
        this.openBitWords.set(next);
    }

    bitWord(item: RtdeItem): { index: number; on: boolean }[] {
        const width = this.bitWidth(item);
        const raw = this.bitValue(item.value);
        const bits: { index: number; on: boolean }[] = [];
        for (let index = 0; index < width; index += 1) {
            bits.push({ index, on: ((raw >> BigInt(index)) & 1n) === 1n });
        }
        return bits;
    }

    format(item: RtdeItem): string {
        const value = item.value;
        if (value === null || value === undefined) {
            return '—';
        }
        if (typeof value === 'boolean') {
            return value ? '1' : '0';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((entry) => this.formatMeasured(item, entry)).join('  ');
        }
        if (this.isMeasured(item)) {
            return this.formatMeasured(item, value);
        }
        return this.formatNumber(value);
    }

    private isMeasured(item: RtdeItem): boolean {
        return item.kind === 'double' || item.valueType === 'DOUBLE' || item.valueType === 'VECTOR3D' || item.valueType === 'VECTOR6D';
    }

    private formatNumber(value: number): string {
        if (!Number.isFinite(value)) {
            return '—';
        }
        return String(value);
    }

    private bitWidth(item: RtdeItem): number {
        if (item.valueType === 'UINT64') {
            return 64;
        }
        if (item.valueType === 'UINT32') {
            return 32;
        }
        return item.name.includes('digital') ? 64 : 32;
    }

    private bitValue(value: RtdeItem['value']): bigint {
        if (typeof value === 'string' && value) {
            try {
                return BigInt(value);
            } catch {
                return 0n;
            }
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return BigInt(Math.trunc(value));
        }
        return 0n;
    }

    private formatMeasured(item: RtdeItem, value: number): string {
        if (item.valueType === 'VECTOR6D' && this.isDisplayedZero(value)) {
            return (0).toFixed(DISPLAY_SIGNIFICANT_DIGITS);
        }
        return this.formatSignificant(value);
    }

    private isDisplayedZero(value: number): boolean {
        return Number.isFinite(value) && Number(value.toFixed(DISPLAY_SIGNIFICANT_DIGITS)) === 0;
    }

    private formatSignificant(value: number): string {
        if (!Number.isFinite(value) || value === 0) {
            return '0';
        }
        const digits = DISPLAY_SIGNIFICANT_DIGITS;
        const precise = Number(value.toPrecision(digits));
        if (precise === 0) {
            return '0';
        }
        const exponent = Math.floor(Math.log10(Math.abs(precise)));
        const decimals = Math.max(0, digits - 1 - exponent);
        return precise.toFixed(decimals);
    }

    ngOnDestroy(): void {
        this.clearSettleTimer();
        if (this.scrollSaveTimer !== undefined) {
            this.persist(this.order(), this.currentScroll());
        }
        this.clearScrollSave();
        this.detachDragListeners();
        this.releaseCapture(this.dragPointer);
        this.ghost?.remove();
        this.ghost = null;
    }

    startDrag(event: PointerEvent, id: string): void {
        if (this.filtering() || this.draggingId() || this.settleTimer || event.button !== 0) {
            return;
        }
        const handle = event.currentTarget as HTMLElement;
        const card = handle.closest('.module');
        if (!(card instanceof HTMLElement)) {
            return;
        }
        event.preventDefault();
        const rect = card.getBoundingClientRect();
        const ghost = card.cloneNode(true) as HTMLElement;
        ghost.classList.add('rtde-drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.margin = '0';
        ghost.style.zIndex = '30';
        ghost.style.pointerEvents = 'none';
        ghost.style.boxShadow = '0 16px 32px rgba(0, 0, 0, 0.28)';
        ghost.style.transformOrigin = `${event.clientX - rect.left}px ${event.clientY - rect.top}px`;
        ghost.style.transform = 'scale(1.03)';
        ghost.style.transition = 'none';
        document.body.appendChild(ghost);
        this.ghost = ghost;
        this.grabOffsetX = event.clientX - rect.left;
        this.grabOffsetY = event.clientY - rect.top;
        this.dragPointer = event.pointerId;
        this.hoverId = null;
        this.originIds = this.pack(this.snapshot()?.groups ?? [], this.order());
        this.attachDragListeners();
        try {
            this.host.nativeElement.setPointerCapture(event.pointerId);
        } catch {
            // The document listeners keep the gesture alive when the card element is replaced.
        }
        this.draggingId.set(id);
    }

    moveDrag(event: PointerEvent): void {
        if (this.dragPointer !== event.pointerId || !this.ghost || this.settleTimer) {
            return;
        }
        const id = this.draggingId();
        if (!id) {
            return;
        }
        event.preventDefault();
        this.ghost.style.left = `${event.clientX - this.grabOffsetX}px`;
        this.ghost.style.top = `${event.clientY - this.grabOffsetY}px`;
        this.scrollModules(event.clientX);
        const target = this.slotUnderPointer(event.clientX, event.clientY);
        const slotId = target?.getAttribute('data-slot-id');
        if (!target || !slotId || slotId === this.hoverId || !this.pointerInCard(event.clientX, event.clientY, target)) {
            if (!slotId) {
                this.hoverId = null;
            }
            return;
        }
        if (target.getAttribute('data-module-id') === id) {
            this.hoverId = slotId;
            return;
        }
        this.hoverId = slotId;
        this.moveCardToSlot(id, slotId);
    }

    endDrag(event: PointerEvent): void {
        if (this.dragPointer !== event.pointerId || this.settleTimer) {
            return;
        }
        this.detachDragListeners();
        this.releaseCapture(event.pointerId);
        this.dragPointer = -1;
        const id = this.draggingId();
        if (!id) {
            return;
        }
        if (event.type === 'pointercancel') {
            this.order.set(this.originIds);
            setTimeout(() => this.settleGhost(id));
            return;
        }
        this.settleGhost(id);
    }

    trackColumn(_index: number, column: BoardColumn): number {
        return column.number;
    }

    trackSlot(_index: number, slot: BoardSlot): string {
        return slot.id;
    }

    trackGroup(_index: number, group: RtdeGroup): string {
        return group.id;
    }

    trackItem(_index: number, item: RtdeItem): string {
        return item.name;
    }

    wrapLabel(label: string): string {
        return label.replaceAll('_', '_\u200b');
    }

    private slotUnderPointer(clientX: number, clientY: number): HTMLElement | null {
        const stack = document.elementsFromPoint?.(clientX, clientY) ?? [];
        for (const node of stack) {
            if (!(node instanceof Element) || node.closest('.rtde-drag-ghost')) {
                continue;
            }
            const slot = node.closest('[data-slot-id]');
            if (slot instanceof HTMLElement) {
                return slot;
            }
        }
        return null;
    }

    private pointerInCard(clientX: number, clientY: number, card: HTMLElement): boolean {
        const rect = card.getBoundingClientRect();
        const insetX = Math.min(24, rect.width * 0.2);
        const insetY = Math.min(24, rect.height * 0.2);
        return clientX > rect.left + insetX && clientX < rect.right - insetX && clientY > rect.top + insetY && clientY < rect.bottom - insetY;
    }

    private moveCardToSlot(id: string, slotId: string): void {
        const ids = this.pack(this.snapshot()?.groups ?? [], this.order());
        const from = ids.indexOf(id);
        const to = LAYOUT_SLOTS.indexOf(slotId);
        if (from < 0 || to < 0 || from === to) {
            return;
        }
        const occupant = ids[to];
        ids[from] = occupant;
        ids[to] = id;
        this.order.set(ids);
    }

    private scrollModules(clientX: number): void {
        const scroller = this.modulesRef?.nativeElement;
        if (!scroller) {
            return;
        }
        const rect = scroller.getBoundingClientRect();
        if (clientX < rect.left + DRAG_EDGE_PX) {
            scroller.scrollLeft -= DRAG_EDGE_STEP_PX;
        } else if (clientX > rect.right - DRAG_EDGE_PX) {
            scroller.scrollLeft += DRAG_EDGE_STEP_PX;
        }
    }

    private settleGhost(id: string): void {
        const ghost = this.ghost;
        const card = this.modulesRef?.nativeElement.querySelector(`[data-module-id="${CSS.escape(id)}"]`);
        if (!ghost || !(card instanceof HTMLElement)) {
            this.finishDrag();
            return;
        }
        const target = card.getBoundingClientRect();
        ghost.style.transition = `left ${DRAG_SETTLE_MS}ms ease, top ${DRAG_SETTLE_MS}ms ease, width ${DRAG_SETTLE_MS}ms ease, height ${DRAG_SETTLE_MS}ms ease, transform ${DRAG_SETTLE_MS}ms ease`;
        ghost.getBoundingClientRect();
        ghost.style.left = `${target.left}px`;
        ghost.style.top = `${target.top}px`;
        ghost.style.width = `${target.width}px`;
        ghost.style.height = `${target.height}px`;
        ghost.style.transform = 'none';
        this.settleTimer = setTimeout(() => this.finishDrag(), DRAG_FINISH_MS);
    }

    private finishDrag(): void {
        this.clearSettleTimer();
        this.ghost?.remove();
        this.ghost = null;
        this.dragPointer = -1;
        this.hoverId = null;
        this.draggingId.set(null);
        const groups = this.snapshot()?.groups ?? [];
        const ids = this.pack(groups, this.order());
        const natural = this.pack(groups, []);
        const stored = ids.every((id, index) => id === natural[index]) ? [] : ids;
        this.order.set(stored);
        this.persist(stored, this.currentScroll());
    }

    private pack(groups: RtdeGroup[], order: readonly string[]): string[] {
        const known = new Set(groups.map((group) => group.id));
        const ids = Array.from({ length: LAYOUT_SLOTS.length }, () => '');
        const seen = new Set<string>();
        if (order.length === 0) {
            groups.forEach((group, index) => {
                if (index < ids.length) {
                    ids[index] = group.id;
                    seen.add(group.id);
                }
            });
            return ids;
        }
        order.forEach((id, index) => {
            if (index >= ids.length || !id || !known.has(id) || seen.has(id)) {
                return;
            }
            ids[index] = id;
            seen.add(id);
        });
        let cursor = 0;
        for (const group of groups) {
            if (seen.has(group.id)) {
                continue;
            }
            while (cursor < ids.length && ids[cursor]) {
                cursor += 1;
            }
            if (cursor >= ids.length) {
                break;
            }
            ids[cursor] = group.id;
            seen.add(group.id);
        }
        return ids;
    }

    private readonly onPointerMove = (event: PointerEvent): void => {
        this.moveDrag(event);
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        this.endDrag(event);
    };

    private attachDragListeners(): void {
        document.addEventListener('pointermove', this.onPointerMove, true);
        document.addEventListener('pointerup', this.onPointerUp, true);
        document.addEventListener('pointercancel', this.onPointerUp, true);
    }

    private detachDragListeners(): void {
        document.removeEventListener('pointermove', this.onPointerMove, true);
        document.removeEventListener('pointerup', this.onPointerUp, true);
        document.removeEventListener('pointercancel', this.onPointerUp, true);
    }

    private releaseCapture(pointerId: number): void {
        const root = this.host.nativeElement;
        if (pointerId >= 0 && root.hasPointerCapture(pointerId)) {
            root.releasePointerCapture(pointerId);
        }
    }

    private clearSettleTimer(): void {
        if (this.settleTimer !== undefined) {
            clearTimeout(this.settleTimer);
            this.settleTimer = undefined;
        }
    }

    private currentScroll(): number {
        return this.modulesRef?.nativeElement.scrollLeft ?? this.viewportScroll();
    }

    private sameCards(cards: Record<string, number>): boolean {
        const current = this.cardScroll();
        const keys = new Set([...Object.keys(cards), ...Object.keys(current)]);
        for (const key of keys) {
            if ((cards[key] ?? 0) !== (current[key] ?? 0)) {
                return false;
            }
        }
        return true;
    }

    private applyCardScrolls(cards: Record<string, number>): boolean {
        const root = this.modulesRef?.nativeElement;
        if (!root) {
            return false;
        }
        let applied = true;
        for (const [id, top] of Object.entries(cards)) {
            if (top <= 1) {
                continue;
            }
            const body = root.querySelector(`[data-module-id="${CSS.escape(id)}"] .module-body`);
            if (!(body instanceof HTMLElement)) {
                applied = false;
                continue;
            }
            body.scrollTop = top;
            if (Math.abs(body.scrollTop - top) > SCROLL_RESTORE_TOLERANCE_PX) {
                applied = false;
            }
        }
        return applied;
    }

    private scheduleScrollSave(): void {
        this.clearScrollSave();
        this.scrollSaveTimer = setTimeout(() => this.persist(this.order(), this.currentScroll()), SCROLL_SAVE_DELAY_MS);
    }

    private readLocal(layoutKey: string): BoardLayout {
        try {
            return readBoardLayout(JSON.parse(localStorage.getItem(this.storageKey(layoutKey)) ?? 'null'));
        } catch {
            return emptyBoardLayout();
        }
    }

    private persist(ids: string[], scroll: number): void {
        const layout: BoardLayout = { order: ids, scroll: Math.max(0, Math.round(scroll)), cards: { ...this.cardScroll() } };
        this.writeLocal(this.layoutKey(), layout);
        this.layoutSaver()?.(layout);
        this.viewportScroll.set(layout.scroll);
    }

    private writeLocal(layoutKey: string, layout: BoardLayout): void {
        try {
            localStorage.setItem(this.storageKey(layoutKey), JSON.stringify(layout));
        } catch {
            // The pendant can refuse storage. The backend copy still survives a restart.
        }
    }

    private clearScrollSave(): void {
        if (this.scrollSaveTimer !== undefined) {
            clearTimeout(this.scrollSaveTimer);
            this.scrollSaveTimer = undefined;
        }
    }

    private storageKey(layoutKey: string): string {
        return `rtde-monitor.layout.${layoutKey}`;
    }

    private async submit(command: RegisterWrite): Promise<void> {
        const writer = this.registerWriter();
        if (!writer || this.editorBusy()) {
            return;
        }
        this.editorBusy.set(true);
        this.editorError.set('');
        this.writeError.set('');
        try {
            await writer(command);
            this.editor.set(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (this.editor()) {
                this.editorError.set(message);
            } else {
                this.writeError.set(message);
            }
        } finally {
            this.editorBusy.set(false);
        }
    }
}
