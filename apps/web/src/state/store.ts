// 클라이언트 상태 저장소 — useSyncExternalStore 기반, 전송 계층 메시지를 반영한다.
import { useSyncExternalStore } from 'react';
import type { ClassView, ClientMessage, SegmentResult } from '@scrap/core';
import type { Transport, ServerMessage } from '../net/transport';

export interface Toast { id: number; text: string; kind: 'info' | 'error' | 'emote'; at: number }

export interface ClientState {
  connected: boolean;
  view: ClassView | null;
  segments: Record<string, SegmentResult>;
  toasts: Toast[];
  clockOffset: number; // serverNow - clientNow
  kicked: boolean;
  lastPhaseVersion: number;
}

const initial: ClientState = { connected: false, view: null, segments: {}, toasts: [], clockOffset: 0, kicked: false, lastPhaseVersion: 0 };

export class GameClient {
  private state: ClientState = { ...initial };
  private listeners = new Set<() => void>();
  private offsets: number[] = [];
  private toastId = 1;
  private unsub: (() => void) | null = null;

  constructor(public transport: Transport) {
    this.unsub = transport.subscribe((m) => this.onMessage(m));
  }

  getState = () => this.state;
  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  private set(patch: Partial<ClientState>) { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(); }

  send(msg: ClientMessage) { this.transport.send(msg); }
  serverNow() { return Date.now() + this.state.clockOffset; }

  toast(text: string, kind: Toast['kind'] = 'info') {
    const t: Toast = { id: this.toastId++, text, kind, at: Date.now() };
    this.set({ toasts: [...this.state.toasts.slice(-3), t] });
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((x) => x.id !== t.id) }), kind === 'error' ? 3500 : 2200);
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'state': {
        const view = m.view;
        // 서버 시각 보정(퐁이 없을 때의 대략치)
        if (this.offsets.length === 0) this.set({ clockOffset: view.serverNow - Date.now() });
        this.set({ view, lastPhaseVersion: view.phaseVersion });
        if (view.match?.segmentId && !this.state.segments[view.match.segmentId]) this.transport.send({ t: 'getSegment', segmentId: view.match.segmentId });
        break;
      }
      case 'segment': {
        const keys = Object.keys(this.state.segments);
        const segments = { ...this.state.segments, [m.segmentId]: m.segment };
        for (const k of keys.slice(0, Math.max(0, keys.length - 3))) delete segments[k];
        this.set({ segments });
        break;
      }
      case 'pong': {
        const now = Date.now();
        const rtt = now - m.c;
        const offset = m.s + rtt / 2 - now;
        this.offsets.push(offset);
        if (this.offsets.length > 7) this.offsets.shift();
        const sorted = [...this.offsets].sort((a, b) => a - b);
        this.set({ clockOffset: sorted[Math.floor(sorted.length / 2)] });
        break;
      }
      case 'error': this.toast(m.error, 'error'); break;
      case 'emote': this.toast(`${m.from}: ${m.emote}`, 'emote'); break;
      case 'kicked': this.set({ kicked: true, connected: false }); break;
      case 'conn': this.set({ connected: m.connected }); if (!m.connected && !this.state.kicked && this.state.view) this.toast('연결이 끊겼어요. 다시 연결 중…', 'error'); break;
    }
  }
  destroy() { this.unsub?.(); this.transport.close(); }
}

export function useClientState(client: GameClient): ClientState {
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}
