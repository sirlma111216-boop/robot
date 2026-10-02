// 경기장 캔버스 렌더러 — 서버 궤적(keyframe)을 보간 재생하고 부가 연출(스파크·먼지·링·자력·부스터)을 그린다.
// 판정은 서버 결과만 사용하며 여기서는 위치를 바꾸지 않는다.
import { ARENAS, ARENA_W, ARENA_H, TEAM_STYLES, deriveSpec, type ArenaDef, type SegmentResult, type SimEvent, type RobotBuild, type Plan, type RobotView } from '@scrap/core';
import { getImage, assetInfo } from '../assets/loader';
import { drawRobot } from './RobotSprite';

export interface TeamInfo { id: string; styleIndex: number; number: number; build: RobotBuild; name: string }

interface Fx { kind: 'spark' | 'ring' | 'dust' | 'glint' | 'text' | 'flame'; x: number; y: number; rot: number; scale: number; life: number; max: number; text?: string; color?: string; vx?: number; vy?: number; id?: string }

export interface PlaybackHooks { onSlot?: (i: number) => void; onEnd?: () => void; onScore?: (teamId: string, delta: number, reason: string) => void }

export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private arena: ArenaDef;
  private teams = new Map<string, TeamInfo>();
  private raf = 0;
  private scale = 1;
  private w = 0; private h = 0;
  // 정적 상태
  private robots: RobotView[] = [];
  private capsules: { id: string; x: number; y: number; taken: boolean }[] = [];
  private preview: { x: number; y: number }[] | null = null;
  // 재생 상태
  private segment: SegmentResult | null = null;
  private startAt = 0;
  private serverNow: () => number = () => Date.now();
  private hooks: PlaybackHooks = {};
  private eventCursor = 0;
  private slotFired = -1;
  private ended = false;
  private fx: Fx[] = [];
  private fallen = new Map<string, number>(); // id → 낙하 시각(t)
  private magnetOn = new Set<string>();
  private bumper = new Map<string, number>();
  private flame = new Map<string, number>();
  private lastPos = new Map<string, { x: number; y: number; t: number }>();
  private dustTimer = new Map<string, number>();
  private shake = 0;
  private skidding = new Set<string>();
  private marks: { x: number; y: number; a: number; life: number }[] = [];
  private squash = new Map<string, { t: number; nx: number; ny: number; amt: number }>();
  private lag = 0; // 히트스톱으로 밀린 표시 시간(곧 따라잡는다 — 서버 시계는 멈추지 않음)
  private freezeLeft = 0;
  private lastFrameTime = performance.now();
  reduceFx = false;
  myTeamId: string | null = null;
  private resizeObs: ResizeObserver | null = null;

  constructor(private canvas: HTMLCanvasElement, arenaId: string) {
    this.ctx = canvas.getContext('2d')!;
    this.arena = ARENAS[arenaId] ?? ARENAS['AR-01'];
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.resizeObs.observe(canvas.parentElement);
    this.loop();
  }

  setArena(id: string) { if (this.arena.id !== id) this.arena = ARENAS[id] ?? this.arena; }
  setTeams(teams: TeamInfo[]) { this.teams = new Map(teams.map((t) => [t.id, t])); }
  setStatic(robots: RobotView[], capsules: { id: string; x: number; y: number; taken: boolean }[], preview: { x: number; y: number }[] | null) {
    this.robots = robots; this.capsules = capsules; this.preview = preview;
    if (this.segment && this.ended) { /* 재생 끝난 뒤 정적 상태로 복귀 */ this.segment = null; }
  }
  stop() { this.segment = null; this.fx = []; this.fallen.clear(); this.magnetOn.clear(); this.flame.clear(); this.bumper.clear(); }

  play(segment: SegmentResult, startAt: number, serverNow: () => number, hooks: PlaybackHooks = {}) {
    this.segment = segment; this.startAt = startAt; this.serverNow = serverNow; this.hooks = hooks;
    this.eventCursor = 0; this.slotFired = -1; this.ended = false; this.fx = []; this.fallen.clear(); this.magnetOn.clear(); this.flame.clear(); this.bumper.clear(); this.lastPos.clear(); this.dustTimer.clear();
    this.preview = null;
    this.skidding.clear(); this.marks = []; this.squash.clear(); this.lag = 0; this.freezeLeft = 0;
  }

  destroy() { cancelAnimationFrame(this.raf); this.resizeObs?.disconnect(); }

  private resize() {
    const parent = this.canvas.parentElement; if (!parent) return;
    const pw = parent.clientWidth, ph = parent.clientHeight;
    if (!pw || !ph) return;
    const s = Math.min(pw / ARENA_W, ph / ARENA_H);
    const w = Math.floor(ARENA_W * s), h = Math.floor(ARENA_H * s);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.scale = s * dpr; this.w = w; this.h = h;
  }

  /** 캔버스 CSS 픽셀 → 경기장 논리 좌표 */
  toArena(px: number, py: number) { return { x: (px / this.w) * ARENA_W, y: (py / this.h) * ARENA_H }; }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const nowP = performance.now();
    const dt = Math.min(0.1, (nowP - this.lastFrameTime) / 1000); this.lastFrameTime = nowP;
    this.draw(dt);
  };

  private currentT(): number { return this.segment ? (this.serverNow() - this.startAt) / 1000 : 0; }

  private draw(dt: number) {
    const ctx = this.ctx; const A = this.arena;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.shake > 0.2) { const s = this.reduceFx ? 0 : this.shake; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); this.shake *= 0.85; }
    const timeSec = performance.now() / 1000;
    // 배경
    const bg = getImage(A.bgImage);
    if (bg) ctx.drawImage(bg, 0, 0, ARENA_W, ARENA_H); else { ctx.fillStyle = '#25304a'; ctx.fillRect(0, 0, ARENA_W, ARENA_H); }
    // 경계
    const b = A.bounds;
    ctx.save(); ctx.strokeStyle = 'rgba(255,200,90,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]); ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); ctx.restore();
    // 저마찰
    for (const s of A.slick) this.drawImg('PR-07', s.x, s.y, s.w, s.h);
    // 컨베이어
    for (const c of A.conveyors) {
      this.drawImg('PR-03', c.x, c.y, c.w, c.h);
      ctx.save(); ctx.beginPath(); ctx.rect(c.x - c.w / 2 + 40, c.y - c.h / 2 + 12, c.w - 80, c.h - 24); ctx.clip();
      ctx.strokeStyle = 'rgba(255,190,80,0.55)'; ctx.lineWidth = 4;
      const dir = Math.sign(c.vx || 1); const off = ((timeSec * Math.abs(c.vx)) % 60) * dir;
      for (let x = c.x - c.w / 2 - 60; x < c.x + c.w / 2 + 60; x += 60) {
        const px = x + off; ctx.beginPath(); ctx.moveTo(px - 10 * dir, c.y - 18); ctx.lineTo(px + 10 * dir, c.y); ctx.lineTo(px - 10 * dir, c.y + 18); ctx.stroke();
      }
      ctx.restore();
    }
    // 낙하 구역
    for (const p of A.pits) {
      ctx.save(); const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r * 1.1); g.addColorStop(0, '#02050a'); g.addColorStop(1, 'rgba(2,5,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      this.drawImg('PR-02', p.x, p.y, p.r * 2.4, p.r * 2.4);
      ctx.save(); ctx.fillStyle = '#04070d'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.78, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // 출발 패드
    A.startPads.forEach((pad, i) => {
      this.drawImg('PR-06', pad.x, pad.y, 130, 130, pad.angle);
      const team = [...this.teams.values()].find((t) => this.robotPad(t.id) === i);
      if (team) { ctx.save(); ctx.strokeStyle = TEAM_STYLES[team.styleIndex].color; ctx.lineWidth = 6; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(pad.x, pad.y, 58, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    });
    // 왕관 영역
    const cz = A.crown;
    ctx.save();
    ctx.fillStyle = 'rgba(255,200,60,0.07)'; ctx.beginPath(); ctx.arc(cz.x, cz.y, cz.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,60,0.85)'; ctx.lineWidth = 5; ctx.setLineDash([26, 14]); ctx.lineDashOffset = -timeSec * 40; ctx.beginPath(); ctx.arc(cz.x, cz.y, cz.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    this.drawImg('PR-04', cz.x, cz.y + Math.sin(timeSec * 2) * 4, 96, 104, timeSec * 0.4);
    // 완충벽
    for (const br of A.barriers) this.drawImg('PR-01', br.x, br.y, br.angle === 90 ? br.h : br.w, br.angle === 90 ? br.w : br.h, br.angle === 90 ? Math.PI / 2 : 0, 1.12);
    // 본체
    if (this.segment) this.drawPlayback(dt, timeSec); else this.drawStatic(timeSec);
    // FX
    this.drawFx(dt);
  }

  private robotPad(teamId: string): number { const r = this.robots.find((x) => x.teamId === teamId); return r ? r.padIndex : -1; }

  private drawImg(id: string, x: number, y: number, w: number, h: number, rot = 0, grow = 1) {
    const img = getImage(id); if (!img) return;
    const ctx = this.ctx; ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.drawImage(img, (-w / 2) * grow, (-h / 2) * grow, w * grow, h * grow); ctx.restore();
  }

  private drawCapsule(x: number, y: number, timeSec: number) {
    this.drawImg('PR-05', x, y + Math.sin(timeSec * 3 + x) * 2, 46, 43);
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(timeSec * 5); ctx.fillStyle = '#2fd7c8'; ctx.beginPath(); ctx.arc(x + 12, y - 12, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  private drawRobotAt(teamId: string, x: number, y: number, angle: number, extra: { alpha?: number; scale?: number; wheelPhase?: number; bumperCompress?: number } = {}) {
    const t = this.teams.get(teamId); if (!t) return;
    const spec = deriveSpec(t.build);
    drawRobot(this.ctx, { x, y, angle, radius: spec.radius, build: t.build, styleIndex: t.styleIndex, number: t.number, highlight: teamId === this.myTeamId, label: t.name, ...extra });
  }

  private drawStatic(timeSec: number) {
    for (const c of this.capsules) if (!c.taken) this.drawCapsule(c.x, c.y, timeSec);
    if (this.preview && this.preview.length > 1) {
      const ctx = this.ctx; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.setLineDash([14, 12]); ctx.lineDashOffset = -timeSec * 60;
      ctx.beginPath(); ctx.moveTo(this.preview[0].x, this.preview[0].y); for (const p of this.preview) ctx.lineTo(p.x, p.y); ctx.stroke();
      const end = this.preview[this.preview.length - 1]; ctx.setLineDash([]); ctx.strokeStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(end.x, end.y, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const sorted = [...this.robots].filter((r) => !r.fallen).sort((a, b) => a.y - b.y);
    for (const r of sorted) this.drawRobotAt(r.teamId, r.x, r.y, r.angle);
  }

  // ---------- 재생 ----------
  private drawPlayback(dt: number, timeSec: number) {
    const seg = this.segment!;
    // 국소 히트스톱: 표시 시간만 잠깐 멈췄다가 빠르게 따라잡는다
    if (this.freezeLeft > 0) { this.freezeLeft -= dt; this.lag = Math.min(0.25, this.lag + dt); } else if (this.lag > 0) this.lag = Math.max(0, this.lag - dt * 0.8);
    const t = Math.max(0, this.currentT() - this.lag);
    const tc = Math.min(t, seg.duration);
    // 이벤트 처리
    while (this.eventCursor < seg.events.length && seg.events[this.eventCursor].t <= tc) this.handleEvent(seg.events[this.eventCursor++], t);
    const slot = Math.min(2, Math.floor(tc / 3));
    if (slot !== this.slotFired && t >= 0) { this.slotFired = slot; this.hooks.onSlot?.(slot); }
    if (t >= seg.duration && !this.ended) { this.ended = true; this.hooks.onEnd?.(); }
    // 프레임 보간
    const frames = seg.frames;
    let i = 0; while (i < frames.length - 2 && frames[i + 1].t <= tc) i++;
    const f0 = frames[i], f1 = frames[Math.min(i + 1, frames.length - 1)];
    const span = f1.t - f0.t; const k = span > 0 ? Math.max(0, Math.min(1, (tc - f0.t) / span)) : 0;
    const nR = seg.bodies.filter((b) => b.kind === 'robot').length;
    const positions: { id: string; x: number; y: number; a: number }[] = [];
    seg.bodies.forEach((body, bi) => {
      if (body.kind === 'robot') {
        const o = bi * 3;
        const x = f0.p[o] + (f1.p[o] - f0.p[o]) * k, y = f0.p[o + 1] + (f1.p[o + 1] - f0.p[o + 1]) * k;
        let da = f1.p[o + 2] - f0.p[o + 2]; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        positions.push({ id: body.id, x, y, a: f0.p[o + 2] + da * k });
      } else {
        const o = nR * 3 + (bi - nR) * 2;
        const x = f0.p[o], y = f0.p[o + 1];
        if (x > -500) this.drawCapsule(x, y, timeSec);
      }
    });
    // 자력 아크
    for (const id of this.magnetOn) {
      const me = positions.find((p) => p.id === id); if (!me) continue;
      const fx = Math.sin(me.a), fy = -Math.cos(me.a);
      for (const o of positions) {
        if (o.id === id) continue; const dx = o.x - me.x, dy = o.y - me.y, d = Math.hypot(dx, dy);
        if (d > 320 || (dx * fx + dy * fy) / d < Math.cos((55 * Math.PI) / 180)) continue;
        this.drawArc(me.x, me.y, o.x, o.y, timeSec);
      }
      this.ctx.save(); this.ctx.strokeStyle = 'rgba(47,215,200,0.35)'; this.ctx.lineWidth = 3; this.ctx.beginPath(); this.ctx.moveTo(me.x, me.y); this.ctx.arc(me.x, me.y, 320, me.a - Math.PI / 2 - 0.96, me.a - Math.PI / 2 + 0.96); this.ctx.closePath(); this.ctx.stroke(); this.ctx.restore();
    }
    // 스키드 자국(접지를 잃고 미끄러진 궤적)
    if (this.marks.length) {
      const ctx = this.ctx; const keepM: typeof this.marks = [];
      for (const mk of this.marks) {
        mk.life -= dt; if (mk.life <= 0) continue; keepM.push(mk);
        ctx.save(); ctx.translate(mk.x, mk.y); ctx.rotate(mk.a); ctx.globalAlpha = Math.min(0.32, mk.life * 0.16); ctx.fillStyle = '#0a0d14';
        ctx.fillRect(-40, -5, 9, 10); ctx.fillRect(31, -5, 9, 10); ctx.restore();
      }
      this.marks = keepM;
    }
    // 로봇
    positions.sort((a, b) => a.y - b.y);
    for (const p of positions) {
      const fell = this.fallen.get(p.id);
      let alpha = 1, scale = 1;
      if (fell !== undefined) { const k2 = Math.min(1, (t - fell) / 0.5); if (k2 >= 1) continue; alpha = 1 - k2; scale = 1 - k2 * 0.6; }
      const last = this.lastPos.get(p.id);
      let speed = 0;
      if (last && t > last.t) speed = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1e-3, t - last.t);
      this.lastPos.set(p.id, { x: p.x, y: p.y, t });
      // 먼지
      const skid = this.skidding.has(p.id) && fell === undefined;
      if (skid && speed > 25 && this.marks.length < 600) this.marks.push({ x: p.x, y: p.y, a: p.a, life: 3 });
      if (!this.reduceFx && (speed > 70 || (skid && speed > 30)) && fell === undefined) {
        const dl = (this.dustTimer.get(p.id) ?? 0) - dt;
        if (dl <= 0) { this.dustTimer.set(p.id, skid ? 0.045 : 0.11); const bx = p.x - Math.sin(p.a) * 30, by = p.y + Math.cos(p.a) * 30; this.fx.push({ kind: 'dust', x: bx + (Math.random() - 0.5) * 20, y: by + (Math.random() - 0.5) * 10, rot: p.a + Math.PI, scale: 0.35 + Math.random() * 0.2, life: 0.55, max: 0.55, vx: -Math.sin(p.a) * 20, vy: Math.cos(p.a) * 20 }); } else this.dustTimer.set(p.id, dl);
      }
      const bc = this.bumper.get(p.id); let compress = 0;
      if (bc !== undefined) { const k3 = (t - bc) / 0.35; compress = k3 < 1 ? Math.sin(k3 * Math.PI) : 0; if (k3 >= 1) this.bumper.delete(p.id); }
      const fl = this.flame.get(p.id);
      if (fl !== undefined && t - fl < 0.7) { const img = getImage('FX-05'); if (img) { const ctx = this.ctx; ctx.save(); ctx.translate(p.x - Math.sin(p.a) * 52, p.y + Math.cos(p.a) * 52); ctx.rotate(p.a); ctx.globalAlpha = 0.9 * (1 - (t - fl) / 0.7); const s = 0.9 + Math.random() * 0.2; ctx.drawImage(img, -22 * s, -10, 44 * s, 120 * s); ctx.restore(); } } else this.flame.delete(p.id);
      // 충돌 방향으로 순간 찌그러졌다 돌아오는 표현(판정과 무관한 시각 효과)
      const sq = this.squash.get(p.id); let sqk = 0;
      if (sq) { const k4 = (t - sq.t) / 0.26; if (k4 >= 1 || k4 < 0) this.squash.delete(p.id); else sqk = Math.sin(k4 * Math.PI) * sq.amt; }
      if (sqk > 0.005 && sq) {
        const ang = Math.atan2(sq.ny, sq.nx); const c2 = this.ctx;
        c2.save(); c2.translate(p.x, p.y); c2.rotate(ang); c2.scale(1 - sqk, 1 + sqk * 0.55); c2.rotate(-ang); c2.translate(-p.x, -p.y);
        this.drawRobotAt(p.id, p.x, p.y, p.a, { alpha, scale, wheelPhase: speed > 5 ? t * speed * 0.5 : 0, bumperCompress: compress });
        c2.restore();
      } else this.drawRobotAt(p.id, p.x, p.y, p.a, { alpha, scale, wheelPhase: speed > 5 && !skid ? t * speed * 0.5 : 0, bumperCompress: compress });
    }
  }

  private drawArc(x1: number, y1: number, x2: number, y2: number, timeSec: number) {
    const img = getImage('FX-04'); const ctx = this.ctx;
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang); ctx.globalAlpha = 0.55 + 0.35 * Math.sin(timeSec * 14);
    if (img) ctx.drawImage(img, 0, -d * 0.18, d, d * 0.36);
    else { ctx.strokeStyle = '#2fd7c8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(d / 2, -d * 0.2, d, 0); ctx.stroke(); }
    ctx.restore();
  }

  private handleEvent(e: SimEvent, t: number) {
    const teamName = (id: string) => this.teams.get(id)?.name ?? id;
    switch (e.type) {
      case 'hit': {
        // 연출 세기는 서버가 계산한 충격량에 비례
        const k = Math.min(1, e.impulse / 18000);
        const base = Math.atan2(e.ny, e.nx);
        this.fx.push({ kind: 'spark', x: e.x, y: e.y, rot: base + Math.PI / 2 + (Math.random() - 0.5), scale: 0.45 + k * 0.75, life: 0.42, max: 0.42 });
        if (e.impulse > 5000) {
          this.fx.push({ kind: 'spark', x: e.x, y: e.y, rot: base - Math.PI / 2 + (Math.random() - 0.5), scale: 0.35 + k * 0.55, life: 0.36, max: 0.36 });
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, rot: 0, scale: 0.2 + k * 0.5, life: 0.32, max: 0.32 });
          const amt = 0.08 + k * 0.2;
          this.squash.set(e.a, { t, nx: e.nx, ny: e.ny, amt }); this.squash.set(e.b, { t, nx: e.nx, ny: e.ny, amt });
          if (!this.reduceFx) { this.freezeLeft = Math.max(this.freezeLeft, 0.03 + k * 0.06); this.shake = Math.max(this.shake, 4 + k * 12); }
        }
        break;
      }
      case 'skid': if (e.on) this.skidding.add(e.id); else this.skidding.delete(e.id); break;
      case 'wall': {
        const k = Math.min(1, e.impulse / 20000);
        this.fx.push({ kind: 'spark', x: e.x, y: e.y, rot: Math.atan2(e.ny, e.nx) + (Math.random() - 0.5), scale: 0.5 + k, life: 0.3, max: 0.3 });
        if (e.impulse > 6000) { this.squash.set(e.id, { t, nx: e.nx, ny: e.ny, amt: 0.06 + k * 0.16 }); if (!this.reduceFx) this.shake = Math.max(this.shake, 3 + k * 7); }
        break;
      }
      case 'bumper': this.bumper.set(e.id, t); if (!this.reduceFx) this.freezeLeft = Math.max(this.freezeLeft, 0.1); this.fx.push({ kind: 'ring', x: e.x, y: e.y, rot: 0, scale: 0.3, life: 0.45, max: 0.45 }); this.fx.push({ kind: 'spark', x: e.x, y: e.y, rot: Math.random() * Math.PI * 2, scale: 1.4, life: 0.4, max: 0.4 }); this.shake = Math.max(this.shake, 10); break;
      case 'magnet': if (e.on) this.magnetOn.add(e.id); else this.magnetOn.delete(e.id); break;
      case 'boost': this.flame.set(e.id, t); break;
      case 'brake': break;
      case 'fall': {
        this.fallen.set(e.id, t);
        this.fx.push({ kind: 'text', x: e.x, y: e.y - 60, rot: 0, scale: 1, life: 1.6, max: 1.6, text: `${teamName(e.id)} 낙하!`, color: '#ff6b6b' });
        if (e.by) this.fx.push({ kind: 'text', x: e.x, y: e.y - 100, rot: 0, scale: 1, life: 1.6, max: 1.6, text: `${teamName(e.by)} +2`, color: '#ffd25a' });
        this.shake = Math.max(this.shake, 8);
        break;
      }
      case 'pickup': this.fx.push({ kind: 'glint', x: e.x, y: e.y, rot: 0, scale: 0.4, life: 0.5, max: 0.5 }); this.fx.push({ kind: 'text', x: e.x, y: e.y - 40, rot: 0, scale: 1, life: 1.1, max: 1.1, text: '+1', color: '#2fd7c8' }); break;
      case 'crown': {
        const c = this.arena.crown;
        if (e.id) this.fx.push({ kind: 'text', x: c.x, y: c.y - 130, rot: 0, scale: 1.3, life: 2.2, max: 2.2, text: `👑 ${teamName(e.id)} +3`, color: '#ffd25a' });
        else if (e.contested.length > 1) this.fx.push({ kind: 'text', x: c.x, y: c.y - 130, rot: 0, scale: 1.1, life: 2.2, max: 2.2, text: '왕관 경합! 0점', color: '#fff' });
        this.fx.push({ kind: 'ring', x: c.x, y: c.y, rot: 0, scale: 1.2, life: 0.8, max: 0.8, color: '#ffd25a' });
        break;
      }
      case 'score': this.hooks.onScore?.(e.id, e.delta, e.reason); break;
      case 'slot': break;
    }
  }

  private drawFx(dt: number) {
    const ctx = this.ctx;
    const keep: Fx[] = [];
    for (const f of this.fx) {
      f.life -= dt; if (f.life <= 0) continue; keep.push(f);
      const k = 1 - f.life / f.max;
      ctx.save();
      if (f.kind === 'spark') { const img = getImage('FX-01'); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = 1 - k; ctx.globalCompositeOperation = 'lighter'; const s = 170 * f.scale * (0.7 + k * 0.5); if (img) ctx.drawImage(img, -s * 0.35, -s / 2, s, s); }
      else if (f.kind === 'ring') { const img = getImage('FX-03'); ctx.translate(f.x, f.y); ctx.globalAlpha = 1 - k; ctx.globalCompositeOperation = 'lighter'; const s = 120 * f.scale * (1 + k * 2.2); if (img) ctx.drawImage(img, -s / 2, -s / 2, s, s); }
      else if (f.kind === 'dust') { const img = getImage('FX-02'); f.x += (f.vx ?? 0) * dt; f.y += (f.vy ?? 0) * dt; ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = 0.55 * (1 - k); const s = 130 * f.scale * (1 + k * 1.2); if (img) ctx.drawImage(img, -s / 2, -s * 0.3, s, s * 0.5); }
      else if (f.kind === 'glint') { const img = getImage('FX-06'); ctx.translate(f.x, f.y); ctx.rotate(k * 0.6); ctx.globalAlpha = 1 - k; ctx.globalCompositeOperation = 'lighter'; const s = 140 * f.scale * (1 + k * 1.5); if (img) ctx.drawImage(img, -s / 2, -s / 2, s, s); }
      else if (f.kind === 'text') { ctx.translate(f.x, f.y - k * 40); ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2; ctx.font = `900 ${34 * f.scale}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = f.color ?? '#fff'; ctx.strokeText(f.text ?? '', 0, 0); ctx.fillText(f.text ?? '', 0, 0); }
      ctx.restore();
    }
    this.fx = keep;
  }
}

export function teamInfosFromView(teams: { id: string; styleIndex: number; build: RobotBuild; name: string }[]): TeamInfo[] {
  return teams.map((t) => ({ id: t.id, styleIndex: t.styleIndex, number: t.styleIndex + 1, build: t.build, name: t.name }));
}

export type { Plan };
