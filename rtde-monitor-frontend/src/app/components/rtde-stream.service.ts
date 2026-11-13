import { Injectable } from '@angular/core';
import { OperatorScreenPresenterAPI } from '@universal-robots/contribution-api';
import { URCAP_ID, VENDOR_ID } from '../../generated/contribution-constants';
import { LAYOUT_STORAGE_PREFIX, RECONNECT_DELAY_MS, WRITE_TIMEOUT_MS } from '../constant';
import { BoardLayout, RegisterWrite, RtdeSnapshot, boardLayoutIsEmpty, emptyBoardLayout, readBoardLayout } from './rtde-snapshot';

interface WriteResult {
    type: 'write-result';
    id?: number;
    ok?: boolean;
    error?: string;
}

interface LayoutMessage {
    type: 'layout';
    order?: unknown;
    scroll?: unknown;
}

interface PendingWrite {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export interface RtdeSession {
    close: () => void;
    write: (command: RegisterWrite) => Promise<void>;
    saveLayout: (layout: BoardLayout) => void;
    setFrequency: (frequency: number) => void;
}

@Injectable({
    providedIn: 'root',
})
export class RtdeStreamService {
    open(
        api: OperatorScreenPresenterAPI,
        path: string,
        onSnapshot: (snapshot: RtdeSnapshot) => void,
        onLayout: (layout: BoardLayout) => void,
    ): RtdeSession {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const base = api.getContainerContributionURL(VENDOR_ID, URCAP_ID, 'rtde-monitor-backend', 'websocket-api');
        const url = `${protocol}//${base}/${path}`;
        let stopped = false;
        let socket: WebSocket | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let nextId = 0;
        let edited = false;
        let pendingLayout: BoardLayout | null = null;
        const storageKey = `${LAYOUT_STORAGE_PREFIX}${path}`;
        const pending = new Map<number, PendingWrite>();

        const storedLayout = (): BoardLayout => {
            try {
                return readBoardLayout(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
            } catch {
                return emptyBoardLayout();
            }
        };

        const flushLayout = (): void => {
            if (!socket || socket.readyState !== WebSocket.OPEN || !pendingLayout) {
                return;
            }
            const layout = pendingLayout;
            pendingLayout = null;
            edited = true;
            socket.send(JSON.stringify({ op: 'layout', order: layout.order, scroll: layout.scroll, cards: layout.cards }));
        };

        const applyLayout = (layout: BoardLayout): void => {
            if (pendingLayout || edited) {
                return;
            }
            if (boardLayoutIsEmpty(layout)) {
                const local = storedLayout();
                if (!boardLayoutIsEmpty(local)) {
                    pendingLayout = local;
                    flushLayout();
                    onLayout(local);
                    return;
                }
            }
            onLayout(layout);
        };

        const failAll = (code: string): void => {
            for (const entry of pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(new Error(code));
            }
            pending.clear();
        };

        const complete = (result: WriteResult): void => {
            if (typeof result.id !== 'number') {
                return;
            }
            const entry = pending.get(result.id);
            if (!entry) {
                return;
            }
            clearTimeout(entry.timer);
            pending.delete(result.id);
            if (result.ok) {
                entry.resolve();
                return;
            }
            entry.reject(new Error(result.error || 'write-failed'));
        };

        const connect = (): void => {
            if (stopped) {
                return;
            }
            socket = new WebSocket(url);
            socket.addEventListener('open', () => flushLayout());
            socket.addEventListener('message', (event: MessageEvent<string>) => {
                if (stopped) {
                    return;
                }
                try {
                    const payload = JSON.parse(event.data) as RtdeSnapshot | WriteResult | LayoutMessage;
                    if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'write-result') {
                        complete(payload);
                        return;
                    }
                    if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'layout') {
                        applyLayout(readBoardLayout(payload));
                        return;
                    }
                    onSnapshot(payload as RtdeSnapshot);
                } catch (error) {
                    console.error('Unable to read RTDE update', error);
                }
            });
            socket.addEventListener('close', () => {
                failAll('offline');
                if (!stopped) {
                    timer = setTimeout(connect, RECONNECT_DELAY_MS);
                }
            });
        };

        connect();
        return {
            close: () => {
                stopped = true;
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
                failAll('offline');
                socket?.close();
            },
            write: (command: RegisterWrite) => {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return Promise.reject(new Error('offline'));
                }
                const id = ++nextId;
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        if (pending.delete(id)) {
                            reject(new Error('timeout'));
                        }
                    }, WRITE_TIMEOUT_MS);
                    pending.set(id, { resolve, reject, timer: timeout });
                    socket?.send(JSON.stringify({ op: 'write', id, kind: command.kind, address: command.address, value: command.value }));
                });
            },
            setFrequency: (frequency: number) => {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return;
                }
                socket.send(JSON.stringify({ op: 'frequency', value: frequency }));
            },
            saveLayout: (layout: BoardLayout) => {
                try {
                    localStorage.setItem(storageKey, JSON.stringify(layout));
                } catch {
                    // The browser copy is optional. The backend file is kept across restarts.
                }
                pendingLayout = layout;
                flushLayout();
            },
        };
    }
}
