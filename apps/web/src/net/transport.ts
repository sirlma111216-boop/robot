// 전송 계층 — NetworkTransport(WebSocket) 와 LocalTransport(브라우저 내 ClassHost) 는 같은 메시지 계약을 쓴다.
import { ClassHost, type ClassView, type ClientMessage, type SegmentResult, type BotLevel, type RobotBuild } from '@scrap/core';

export type ServerMessage =
  | { t: 'state'; view: ClassView }
  | { t: 'segment'; segmentId: string; segment: SegmentResult }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; error: string }
  | { t: 'emote'; teamId: string; from: string; emote: string }
  | { t: 'kicked' }
  | { t: 'conn'; connected: boolean; reason?: string };

export interface Transport {
  readonly kind: 'local' | 'network';
  send(msg: ClientMessage): void;
  subscribe(cb: (msg: ServerMessage) => void): () => void;
  close(): void;
}

// ---------------- 네트워크 ----------------
export class NetworkTransport implements Transport {
  readonly kind = 'network' as const;
  private ws: WebSocket | null = null;
  private subs = new Set<(m: ServerMessage) => void>();
  private closed = false;
  private retry = 0;
  private pingTimer: number | null = null;

  constructor(private url: string) { this.connect(); }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.emit({ t: 'conn', connected: true });
      ws.send(JSON.stringify({ t: 'hello' }));
      for (let i = 0; i < 4; i++) setTimeout(() => this.ping(), 150 * i);
      this.pingTimer = window.setInterval(() => this.ping(), 12_000);
    };
    ws.onmessage = (ev) => { try { this.emit(JSON.parse(ev.data)); } catch { /* ignore */ } };
    ws.onclose = (ev) => {
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.emit({ t: 'conn', connected: false, reason: ev.reason });
      if (this.closed || ev.code === 4003 || ev.code === 4000) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => { /* onclose 가 처리 */ };
  }
  private ping() { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); }
  send(msg: ClientMessage) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); else this.emit({ t: 'error', error: '연결이 끊겼어요. 다시 연결 중…' }); }
  subscribe(cb: (m: ServerMessage) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  private emit(m: ServerMessage) { for (const s of this.subs) s(m); }
  close() { this.closed = true; if (this.pingTimer) clearInterval(this.pingTimer); this.ws?.close(); }
}

// ---------------- 로컬(솔로 연습) ----------------
export interface LocalOptions { nick: string; bots: number; botLevel: BotLevel; matches: 1 | 3; build?: RobotBuild; planSeconds?: number; buildSeconds?: number }

export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  private host: ClassHost;
  private me: string;
  private subs = new Set<(m: ServerMessage) => void>();
  private timer: number | null = null;
  private speed = 1;

  constructor(opts: LocalOptions) {
    const now = Date.now();
    this.host = new ClassHost({ code: 'SOLO', now, seed: (Math.random() * 2 ** 31) >>> 0, teacherId: 'teacher', teacherNick: '미라' });
    const j = this.host.joinStudent(opts.nick || '나', now);
    if (!j.ok) throw new Error(j.error);
    this.me = j.playerId;
    this.host.handle('teacher', { t: 'teacher:assignLeader', playerId: this.me }, now);
    for (let i = 0; i < Math.max(1, Math.min(5, opts.bots)); i++) this.host.handle('teacher', { t: 'teacher:addBotTeam', level: opts.botLevel }, now);
    this.host.handle('teacher', { t: 'teacher:setSettings', settings: { matches: opts.matches, planSeconds: opts.planSeconds ?? 30, buildSeconds: opts.buildSeconds ?? 120, pitstopSeconds: 45, autoAdvance: true } }, now);
    if (opts.build) this.host.handle(this.me, { t: 'setBuild', build: opts.build }, now);
    this.host.setConnected(this.me, true, now);
    this.host.handle('teacher', { t: 'teacher:start' }, now);
    queueMicrotask(() => { this.emit({ t: 'conn', connected: true }); this.pushState(); this.schedule(); });
  }
  private now() { return Date.now(); }
  private pushState() { this.emit({ t: 'state', view: this.host.viewFor(this.me, this.now()) }); }
  private flush() {
    for (const e of this.host.drainEffects()) {
      if (e.type === 'segment') { const seg = this.host.getSegment(e.segmentId); if (seg) this.emit({ t: 'segment', segmentId: e.segmentId, segment: seg }); }
      if (e.type === 'emote') this.emit({ t: 'emote', teamId: e.teamId, from: e.from, emote: e.emote });
    }
    this.pushState();
    this.schedule();
  }
  private schedule() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const wake = this.host.nextWakeAt();
    if (wake === null) return;
    const delay = Math.max(0, (wake - this.now()) / this.speed);
    this.timer = window.setTimeout(() => { this.timer = null; if (this.host.tick(this.now())) this.flush(); else this.schedule(); }, delay);
  }
  send(msg: ClientMessage) {
    const now = this.now();
    if (msg.t === 'ping') { this.emit({ t: 'pong', c: msg.c, s: now }); return; }
    if (msg.t === 'hello') { this.pushState(); const m = this.host.state.match; if (m?.segmentId) { const seg = this.host.getSegment(m.segmentId); if (seg) this.emit({ t: 'segment', segmentId: m.segmentId, segment: seg }); } return; }
    if (msg.t === 'getSegment') { const seg = this.host.getSegment(msg.segmentId); if (seg) this.emit({ t: 'segment', segmentId: msg.segmentId, segment: seg }); return; }
    const pid = msg.t.startsWith('teacher:') ? 'teacher' : this.me;
    const r = this.host.handle(pid, msg, now);
    if (!r.ok) { this.emit({ t: 'error', error: r.error }); return; }
    this.host.tick(now);
    this.flush();
  }
  subscribe(cb: (m: ServerMessage) => void) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  private emit(m: ServerMessage) { for (const s of this.subs) s(m); }
  close() { if (this.timer) clearTimeout(this.timer); }
}
