export interface RtdeItem {
    label: string;
    name: string;
    value: number | boolean | string | number[] | null;
    writable?: boolean;
    kind?: 'bit' | 'int' | 'double';
    address?: number;
    valueType?: string;
}

export interface RegisterWrite {
    kind: 'bit' | 'int' | 'double';
    address: number;
    value: number;
}

export interface CubeAngles {
    x: number;
    y: number;
}

export interface BoardLayout {
    order: string[];
    scroll: number;
    cards: Record<string, number>;
    cube: CubeAngles;
}

export function normalizeAngle(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const wrapped = ((Math.round(value) % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
}

export function emptyCube(): CubeAngles {
    return { x: 0, y: 0 };
}

export function readCube(value: unknown): CubeAngles {
    if (!value || typeof value !== 'object') {
        return emptyCube();
    }
    const record = value as { x?: unknown; y?: unknown };
    return {
        x: typeof record.x === 'number' ? normalizeAngle(record.x) : 0,
        y: typeof record.y === 'number' ? normalizeAngle(record.y) : 0,
    };
}

export function emptyBoardLayout(): BoardLayout {
    return { order: [], scroll: 0, cards: {}, cube: emptyCube() };
}

export function readBoardLayout(value: unknown): BoardLayout {
    if (Array.isArray(value)) {
        return { order: value.filter((id): id is string => typeof id === 'string'), scroll: 0, cards: {}, cube: emptyCube() };
    }
    if (!value || typeof value !== 'object') {
        return emptyBoardLayout();
    }
    const record = value as { order?: unknown; scroll?: unknown; cards?: unknown; cube?: unknown };
    const order = Array.isArray(record.order) ? record.order.filter((id): id is string => typeof id === 'string') : [];
    const scroll = typeof record.scroll === 'number' && Number.isFinite(record.scroll) ? Math.max(0, Math.round(record.scroll)) : 0;
    const cards: Record<string, number> = {};
    if (record.cards && typeof record.cards === 'object') {
        for (const [id, top] of Object.entries(record.cards)) {
            if (typeof top === 'number' && Number.isFinite(top) && top > 1) {
                cards[id] = Math.max(0, Math.round(top));
            }
        }
    }
    return { order, scroll, cards, cube: readCube(record.cube) };
}

export function boardLayoutIsEmpty(layout: BoardLayout): boolean {
    return layout.order.length === 0 && layout.scroll === 0 && Object.keys(layout.cards).length === 0 && layout.cube.x === 0 && layout.cube.y === 0;
}

export interface RtdeGroup {
    id: string;
    title: string;
    kind: 'bits' | 'numbers' | 'fields';
    items: RtdeItem[];
}

export interface RtdeSnapshot {
    ok: boolean;
    error: string;
    host: string;
    frequency: number;
    unavailable: string[];
    groups: RtdeGroup[];
}
