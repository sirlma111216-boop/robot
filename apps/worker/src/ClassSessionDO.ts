// 클래스 하나 = Durable Object 인스턴스 하나(SQLite-backed). 참가자·팀·경기 권위 상태와 WebSocket 을 담당한다.
import { DurableObject } from 'cloudflare:workers';
import { ClassHost, parseClientMessage, MAX_MESSAGE_BYTES, RATE_LIMIT_PER_10S, nicknameSchema, type ClassState } from '@scrap/core';

export interface Env {
  CLASS: DurableObjectNamespace<ClassSessionDO>;
  ASSETS: Fetcher;
  TEACHER_PASSWORD: string;
  CLASS_TTL_HOURS?: string;
}

interface Attachment { playerId: string; role: 'teacher' | 'student' }

const TEACHER_ID = 'teacher';
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomToken(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = ''; for (const b of bytes) s += TOKEN_CHARS[b % TOKEN_CHARS.length];
  return s;
}

export class ClassSessionDO extends DurableObject<Env> {
  private host: ClassHost | null = null;
  private tokens: Record<string, string> = {};
  private loaded = false;
  private rate = new Map<WebSocket, { n: number; at: number }>();
  private broadcastScheduled = false;
  private joinTimes: number[] = [];
  private savedSegKey = '';

  private async ensureLoaded() {
    if (this.loaded) return;
    const state = await this.ctx.storage.get<ClassState>('state');
    const tokens = await this.ctx.storage.get<Record<string, string>>('tokens');
    if (state) {
      // 궤적(segments)은 크기가 커서 별도 키에 저장한다
      const segs = await this.ctx.storage.get<ClassState['segments']>('segments');
      if (segs) state.segments = segs;
      this.savedSegKey = Object.keys(state.segments ?? {}).join(',');
      this.host = new ClassHost(state);
    }
    if (tokens) this.tokens = tokens;
    this.loaded = true;
  }

  private async save() {
    if (!this.host) return;
    // 상태 본문은 매번, 궤적은 새 구간이 생겼을 때만 쓴다(명령 제안 같은 잦은 메시지마다 수십 KB 를 다시 쓰지 않도록)
    const { segments, ...rest } = this.host.state;
    const puts: Record<string, unknown> = { state: { ...rest, segments: {} }, lastActivity: Date.now() };
    const segKey = Object.keys(segments).join(',');
    if (segKey !== this.savedSegKey) { puts.segments = segments; this.savedSegKey = segKey; }
    await this.ctx.storage.put(puts);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm() {
    if (!this.host) return;
    const wake = this.host.nextWakeAt();
    const ttlH = Number(this.env.CLASS_TTL_HOURS ?? '24');
    const expiry = ((await this.ctx.storage.get<number>('lastActivity')) ?? Date.now()) + ttlH * 3600_000;
    const next = wake !== null ? Math.min(wake, expiry) : expiry;
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || Math.abs(cur - next) > 500) await this.ctx.storage.setAlarm(next);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);
    const path = url.pathname;
    const now = Date.now();

    if (path === '/init' && request.method === 'POST') {
      const body = await request.json<{ code: string }>().catch(() => ({ code: '' }));
      if (!body.code) return Response.json({ ok: false, error: '잘못된 요청이에요.' }, { status: 400 });
      if (!this.host) {
        this.host = new ClassHost({ code: body.code, now, seed: (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0), teacherId: TEACHER_ID });
        await this.save();
      }
      return Response.json({ ok: true, code: this.host.state.code });
    }
    if (!this.host) return Response.json({ ok: false, error: '없는 클래스 코드예요.' }, { status: 404 });

    if (path === '/info') {
      const st = this.host.state;
      return Response.json({ ok: true, code: st.code, phase: st.phase, locked: st.locked, students: this.host.studentCount, teams: st.teamOrder.length });
    }
    if (path === '/join' && request.method === 'POST') {
      // 짧은 시간에 입장이 몰리면(스크립트 등) 잠깐 막는다. 한 반 30명이 동시에 들어오는 정도는 통과
      this.joinTimes = this.joinTimes.filter((t) => now - t < 10_000);
      if (this.joinTimes.length >= 40) return Response.json({ ok: false, error: '입장이 몰리고 있어요. 잠시 후 다시 시도해요.' }, { status: 429 });
      this.joinTimes.push(now);
      const body = await request.json<{ nick?: string }>().catch(() => ({} as { nick?: string }));
      const nick = nicknameSchema.safeParse(body.nick);
      if (!nick.success) return Response.json({ ok: false, error: nick.error.issues[0]?.message ?? '닉네임을 확인해요' }, { status: 400 });
      const r = this.host.joinStudent(nick.data, now);
      if (!r.ok) return Response.json(r, { status: 409 });
      const token = randomToken(24);
      this.tokens[token] = r.playerId;
      await this.ctx.storage.put('tokens', this.tokens);
      await this.save();
      this.scheduleBroadcast();
      return Response.json({ ok: true, token, playerId: r.playerId, nick: this.host.state.players[r.playerId].nick });
    }
    if (path === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const isTeacher = request.headers.get('x-teacher') === '1';
      let playerId: string | null = null;
      if (isTeacher) playerId = TEACHER_ID;
      else {
        const token = url.searchParams.get('token') ?? '';
        playerId = this.tokens[token] ?? null;
        if (!playerId || !this.host.state.players[playerId]) return Response.json({ ok: false, error: '입장 정보가 만료됐어요. 다시 입장해요.' }, { status: 401 });
      }
      // 한 사람이 소켓을 여러 개 열면 가장 오래된 것부터 닫는다(탭 여러 개·재접속 잔여 정리)
      const mine = this.ctx.getWebSockets().filter((w) => (w.deserializeAttachment() as Attachment | null)?.playerId === playerId);
      for (const old of mine.slice(0, Math.max(0, mine.length - 2))) { try { old.close(4004, 'replaced'); } catch { /* noop */ } }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const att: Attachment = { playerId, role: isTeacher ? 'teacher' : 'student' };
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(att);
      this.host.setConnected(playerId, true, now);
      await this.save();
      this.scheduleBroadcast();
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/delete' && request.method === 'POST') {
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(4000, 'closed'); } catch { /* noop */ } }
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.host = null; this.tokens = {};
      return Response.json({ ok: true });
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ensureLoaded();
    if (!this.host) { ws.close(4001, 'no class'); return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) { ws.close(4002, 'no attachment'); return; }
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) { this.send(ws, { t: 'error', error: '메시지가 너무 커요.' }); return; }
    // 빈도 제한
    const now = Date.now();
    const r = this.rate.get(ws) ?? { n: 0, at: now };
    if (now - r.at > 10_000) { r.n = 0; r.at = now; }
    r.n++; this.rate.set(ws, r);
    if (r.n > RATE_LIMIT_PER_10S) { this.send(ws, { t: 'error', error: '너무 빨리 보내고 있어요. 잠깐 기다려요.' }); return; }

    let json: unknown;
    try { json = JSON.parse(raw); } catch { this.send(ws, { t: 'error', error: '잘못된 메시지예요.' }); return; }
    const parsed = parseClientMessage(json);
    if (!parsed.ok) { this.send(ws, { t: 'error', error: parsed.error }); return; }
    const msg = parsed.msg;
    if (msg.t === 'ping') { this.send(ws, { t: 'pong', c: msg.c, s: now }); return; }
    if (msg.t === 'hello') { this.send(ws, { t: 'state', view: this.host.viewFor(att.playerId, now) }); const m = this.host.state.match; if (m?.segmentId) { const seg = this.host.getSegment(m.segmentId); if (seg) this.send(ws, { t: 'segment', segmentId: m.segmentId, segment: seg }); } return; }
    if (msg.t === 'getSegment') { const seg = this.host.getSegment(msg.segmentId); if (seg) this.send(ws, { t: 'segment', segmentId: msg.segmentId, segment: seg }); else this.send(ws, { t: 'error', error: '재생 자료를 찾을 수 없어요' }); return; }
    // 교사 권한은 매 명령에서 attachment 역할로 재검증
    if (msg.t.startsWith('teacher:') && att.role !== 'teacher') { this.send(ws, { t: 'error', error: '선생님만 할 수 있어요.' }); return; }
    const res = this.host.handle(att.playerId, msg, now);
    if (!res.ok) { this.send(ws, { t: 'error', error: res.error }); return; }
    this.host.tick(now);
    await this.afterMutation();
  }

  async webSocketClose(ws: WebSocket) {
    await this.ensureLoaded();
    this.rate.delete(ws);
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att && this.host) {
      const stillOpen = this.ctx.getWebSockets().some((o) => o !== ws && (o.deserializeAttachment() as Attachment | null)?.playerId === att.playerId);
      if (!stillOpen) this.host.setConnected(att.playerId, false, Date.now());
      await this.save();
      this.scheduleBroadcast();
    }
  }

  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws); }

  async alarm() {
    await this.ensureLoaded();
    if (!this.host) return;
    const now = Date.now();
    const last = (await this.ctx.storage.get<number>('lastActivity')) ?? now;
    const ttlH = Number(this.env.CLASS_TTL_HOURS ?? '24');
    if (now - last > ttlH * 3600_000 && this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.host = null; this.tokens = {};
      return;
    }
    const advanced = this.host.tick(now);
    if (advanced) await this.afterMutation();
    else await this.scheduleAlarm();
  }

  private async afterMutation() {
    if (!this.host) return;
    const effects = this.host.drainEffects();
    await this.save();
    for (const e of effects) {
      if (e.type === 'segment') {
        const seg = this.host.getSegment(e.segmentId);
        if (seg) this.broadcastRaw(JSON.stringify({ t: 'segment', segmentId: e.segmentId, segment: seg }));
      } else if (e.type === 'emote') {
        this.broadcastRaw(JSON.stringify({ t: 'emote', teamId: e.teamId, from: e.from, emote: e.emote }));
      } else if (e.type === 'kicked') {
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Attachment | null;
          if (a?.playerId === e.playerId) { this.send(ws, { t: 'kicked' }); try { ws.close(4003, 'kicked'); } catch { /* noop */ } }
        }
      }
    }
    this.broadcastViews();
  }

  private scheduleBroadcast() {
    if (this.broadcastScheduled) return;
    this.broadcastScheduled = true;
    queueMicrotask(() => { this.broadcastScheduled = false; this.broadcastViews(); });
  }

  private broadcastViews() {
    if (!this.host) return;
    const now = Date.now();
    const cache = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a) continue;
      // 뷰는 팀 기준으로 달라지므로 (playerId 기준) 캐시
      let payload = cache.get(a.playerId);
      if (!payload) { payload = JSON.stringify({ t: 'state', view: this.host.viewFor(a.playerId, now) }); cache.set(a.playerId, payload); }
      try { ws.send(payload); } catch { /* 닫힌 소켓 */ }
    }
  }

  private broadcastRaw(payload: string) {
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(payload); } catch { /* noop */ } }
  }

  private send(ws: WebSocket, obj: unknown) { try { ws.send(JSON.stringify(obj)); } catch { /* noop */ } }
}
