// 클래스 호스트 — 클래스·팀·대회·턴 상태기계. Durable Object 와 솔로(브라우저)가 같은 코드를 사용한다.
// 시간은 항상 인자로 받는다(now). 예약은 nextWakeAt() 로 알려주고, 호출자가 알람/타이머를 건다.
import type { ClassState, ClassView, HostEffect, MatchState, Phase, Player, Settings, Team, TeamView } from './types';
import type { ClientMessage } from '../protocol/messages';
import { PRESETS, validateBuild } from '../content/parts';
import { ARENAS, CHAPTERS } from '../content/arenas';
import { DEFAULT_TIMING, RANK_POINTS, RULES_VERSION, CONTENT_VERSION, PHYSICS_VERSION, SAFE_PLAN, TURNS_PER_MATCH } from '../content/rules';
import { MAX_TEAMS, MAX_STUDENTS, DEFAULT_MAX_TEAM_SIZE, TEAM_NAME_POOL } from '../content/teams';
import { deriveSpec, validatePlan, planCost, type Plan } from '../rules/commands';
import { runSegment, respawnFallen, type RobotSimState } from '../physics/sim';
import { planForBot, buildForBot, BOT_NAMES, type BotLevel } from '../bots/bot';

const MAX_SEGMENTS_KEPT = 2; // 현재 구간 + 직전 구간(재접속용)
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) { h ^= p | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return h >>> 0;
}

export interface HostOptions { code: string; now: number; seed: number; teacherId: string | null; teacherNick?: string }

export type HandleResult = { ok: true } | { ok: false; error: string };

export class ClassHost {
  state: ClassState;
  private effects: HostEffect[] = [];
  private idCounter = 0;
  private random: () => number;

  constructor(init: ClassState | HostOptions) {
    if ('players' in init) this.state = init;
    else {
      this.state = {
        code: init.code, createdAt: init.now, locked: false,
        settings: makeSettings(),
        players: {}, teams: {}, teamOrder: [], phase: 'LOBBY', phaseVersion: 1, deadline: null, match: null, history: [],
        seed: init.seed, versions: { rules: RULES_VERSION, content: CONTENT_VERSION, physics: PHYSICS_VERSION },
        teacherId: init.teacherId, prevLeader: {}, segments: {},
      };
      if (init.teacherId) this.state.players[init.teacherId] = { id: init.teacherId, nick: init.teacherNick ?? '선생님', role: 'teacher', teamId: null, connected: false, joinedAt: init.now, lastSeen: init.now };
    }
    let s = hashSeed(this.state.seed, this.state.phaseVersion, 77);
    this.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  drainEffects(): HostEffect[] { const e = this.effects; this.effects = []; return e; }

  private newId(prefix: string): string {
    let s = prefix;
    for (let i = 0; i < 8; i++) s += ID_CHARS[Math.floor(this.random() * ID_CHARS.length)];
    s += (this.idCounter++).toString(36);
    return s;
  }

  // ---------- 참가자 ----------
  get studentCount(): number { return Object.values(this.state.players).filter((p) => p.role === 'student').length; }

  joinStudent(nick: string, now: number): { ok: true; playerId: string } | { ok: false; error: string } {
    if (this.state.locked) return { ok: false, error: '지금은 입장이 잠겨 있어요. 선생님께 말해요.' };
    if (this.studentCount >= MAX_STUDENTS) return { ok: false, error: `학생 정원(${MAX_STUDENTS}명)이 찼어요.` };
    const trimmed = nick.trim();
    let final = trimmed;
    const nicks = new Set(Object.values(this.state.players).map((p) => p.nick));
    let n = 2;
    while (nicks.has(final)) final = `${trimmed}${n++}`;
    const id = this.newId('p');
    this.state.players[id] = { id, nick: final, role: 'student', teamId: null, connected: false, joinedAt: now, lastSeen: now };
    return { ok: true, playerId: id };
  }

  setConnected(playerId: string, connected: boolean, now: number) {
    const p = this.state.players[playerId];
    if (!p) return;
    p.connected = connected; p.lastSeen = now;
  }

  // ---------- 메시지 처리 ----------
  handle(playerId: string, msg: ClientMessage, now: number): HandleResult {
    const p = this.state.players[playerId];
    if (!p) return { ok: false, error: '참가자 정보를 찾을 수 없어요. 다시 입장해요.' };
    p.lastSeen = now;
    const st = this.state;
    const isTeacher = p.role === 'teacher';
    const team = p.teamId ? st.teams[p.teamId] : undefined;
    const isLeader = !!team && team.leaderId === playerId;

    if (msg.t.startsWith('teacher:')) {
      if (!isTeacher) return { ok: false, error: '선생님만 할 수 있어요.' };
      return this.handleTeacher(p, msg, now);
    }
    switch (msg.t) {
      case 'hello': case 'ping': case 'getSegment': return { ok: true };
      case 'joinTeam': {
        const t = st.teams[msg.teamId];
        if (!t) return { ok: false, error: '없는 팀이에요.' };
        if (t.bot) return { ok: false, error: '봇 팀에는 들어갈 수 없어요.' };
        if (isLeader) return { ok: false, error: '팀장은 팀을 옮길 수 없어요. 선생님께 말해요.' };
        if (t.id !== p.teamId && t.members.length >= st.settings.maxTeamSize) return { ok: false, error: '이 팀은 자리가 없어요.' };
        this.movePlayer(p, t.id);
        return { ok: true };
      }
      case 'leaveTeam': {
        if (!team) return { ok: true };
        if (isLeader) return { ok: false, error: '팀장은 팀을 떠날 수 없어요.' };
        if (st.phase !== 'LOBBY') return { ok: false, error: '경기 중에는 팀을 떠날 수 없어요.' };
        this.movePlayer(p, null);
        return { ok: true };
      }
      case 'setBuild': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        if (!isLeader) return { ok: false, error: '조립은 팀장이 확정해요. 부품을 추천해 보세요!' };
        if (st.phase !== 'BUILD' && st.phase !== 'PITSTOP' && st.phase !== 'LOBBY') return { ok: false, error: '지금은 조립할 수 없어요.' };
        const v = validateBuild(msg.build);
        if (!v.ok) return { ok: false, error: v.reason };
        team.build = { ...msg.build, utilities: [...msg.build.utilities] };
        team.buildReady = false;
        return { ok: true };
      }
      case 'suggestPart': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        team.suggestions = team.suggestions.filter((s) => s.by !== playerId);
        team.suggestions.push({ by: playerId, partId: msg.partId });
        if (team.suggestions.length > 8) team.suggestions.shift();
        return { ok: true };
      }
      case 'ready': {
        if (!team || !isLeader) return { ok: false, error: '팀장만 준비 완료를 누를 수 있어요.' };
        if (st.phase !== 'BUILD' && st.phase !== 'PITSTOP') return { ok: false, error: '지금은 준비할 단계가 아니에요.' };
        const v = validateBuild(team.build);
        if (!v.ok) return { ok: false, error: v.reason };
        team.buildReady = msg.ready;
        this.maybeAdvanceEarly(now);
        return { ok: true };
      }
      case 'proposePlan': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        if (st.phase !== 'PLAN') return { ok: false, error: '지금은 명령을 낼 수 없어요.' };
        const v = validatePlan(msg.plan, team.build, team.energy);
        if (!v.ok) return { ok: false, error: v.reason };
        team.proposals = team.proposals.filter((x) => x.by !== playerId);
        team.proposals.push({ id: this.newId('q'), by: playerId, plan: v.plan, votes: [playerId], at: now });
        return { ok: true };
      }
      case 'votePlan': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        const q = team.proposals.find((x) => x.id === msg.proposalId);
        if (!q) return { ok: false, error: '없는 제안이에요.' };
        for (const other of team.proposals) other.votes = other.votes.filter((v) => v !== playerId);
        q.votes.push(playerId);
        return { ok: true };
      }
      case 'lockPlan': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        if (!isLeader) return { ok: false, error: '명령 확정은 팀장이 해요. 제안을 올려 주세요!' };
        if (st.phase !== 'PLAN') return { ok: false, error: '지금은 명령을 확정할 수 없어요.' };
        const v = validatePlan(msg.plan, team.build, team.energy);
        if (!v.ok) return { ok: false, error: v.reason };
        team.lockedPlan = v.plan;
        this.maybeAdvanceEarly(now);
        return { ok: true };
      }
      case 'unlockPlan': {
        if (!team || !isLeader) return { ok: false, error: '팀장만 할 수 있어요.' };
        if (st.phase !== 'PLAN') return { ok: false, error: '지금은 바꿀 수 없어요.' };
        team.lockedPlan = null;
        return { ok: true };
      }
      case 'emote': {
        if (!team) return { ok: false, error: '팀에 먼저 들어가요.' };
        team.emote = { emote: msg.emote, from: p.nick, at: now };
        this.effects.push({ type: 'emote', teamId: team.id, from: p.nick, emote: msg.emote });
        return { ok: true };
      }
      case 'renameTeam': {
        if (!team || !isLeader) return { ok: false, error: '팀 이름은 팀장이 바꿔요.' };
        team.name = msg.name;
        return { ok: true };
      }
    }
    return { ok: false, error: '알 수 없는 요청이에요.' };
  }

  private handleTeacher(p: Player, msg: ClientMessage, now: number): HandleResult {
    const st = this.state;
    switch (msg.t) {
      case 'teacher:setSettings': {
        if (st.phase !== 'LOBBY' && (msg.settings.matches !== undefined)) return { ok: false, error: '경기 수는 시작 전에만 바꿀 수 있어요.' };
        Object.assign(st.settings, msg.settings);
        return { ok: true };
      }
      case 'teacher:assignLeader': {
        const target = st.players[msg.playerId];
        if (!target || target.role !== 'student') return { ok: false, error: '학생을 찾을 수 없어요.' };
        let team = msg.teamId ? st.teams[msg.teamId] : undefined;
        if (msg.teamId && !team) return { ok: false, error: '없는 팀이에요.' };
        if (team?.bot) return { ok: false, error: '봇 팀에는 팀장을 둘 수 없어요.' };
        if (!team) {
          if (st.phase !== 'LOBBY') return { ok: false, error: '새 팀은 대기실에서만 만들 수 있어요.' };
          if (st.teamOrder.length >= MAX_TEAMS) return { ok: false, error: `팀은 최대 ${MAX_TEAMS}개예요.` };
          team = this.createTeam(null);
        }
        if (team.leaderId && team.leaderId !== target.id) {
          // 기존 팀장은 팀원으로 남는다
        }
        this.movePlayer(target, team.id);
        team.leaderId = target.id;
        return { ok: true };
      }
      case 'teacher:removeTeam': {
        if (st.phase !== 'LOBBY') return { ok: false, error: '팀 삭제는 대기실에서만 할 수 있어요.' };
        const team = st.teams[msg.teamId];
        if (!team) return { ok: false, error: '없는 팀이에요.' };
        for (const m of team.members) { const mp = st.players[m]; if (mp) mp.teamId = null; }
        delete st.teams[team.id];
        st.teamOrder = st.teamOrder.filter((id) => id !== team.id);
        return { ok: true };
      }
      case 'teacher:addBotTeam': {
        if (st.phase !== 'LOBBY') return { ok: false, error: '봇 팀은 대기실에서만 추가할 수 있어요.' };
        if (st.teamOrder.length >= MAX_TEAMS) return { ok: false, error: `팀은 최대 ${MAX_TEAMS}개예요.` };
        this.createTeam(msg.level ?? st.settings.botLevel);
        return { ok: true };
      }
      case 'teacher:autoAssign': {
        const teams = st.teamOrder.map((id) => st.teams[id]).filter((t) => !t.bot);
        if (teams.length === 0) return { ok: false, error: '먼저 팀장을 지정해 팀을 만들어요.' };
        const free = Object.values(st.players).filter((x) => x.role === 'student' && !x.teamId).sort((a, b) => a.joinedAt - b.joinedAt);
        for (const s of free) {
          const t = [...teams].sort((a, b) => a.members.length - b.members.length)[0];
          if (t.members.length >= st.settings.maxTeamSize) break;
          this.movePlayer(s, t.id);
        }
        return { ok: true };
      }
      case 'teacher:movePlayer': {
        const target = st.players[msg.playerId];
        if (!target || target.role !== 'student') return { ok: false, error: '학생을 찾을 수 없어요.' };
        const cur = target.teamId ? st.teams[target.teamId] : undefined;
        if (cur && cur.leaderId === target.id) return { ok: false, error: '팀장은 먼저 다른 팀장을 지정한 뒤 옮길 수 있어요.' };
        if (msg.teamId) { const t = st.teams[msg.teamId]; if (!t || t.bot) return { ok: false, error: '없는 팀이에요.' }; }
        this.movePlayer(target, msg.teamId);
        return { ok: true };
      }
      case 'teacher:start': {
        if (st.phase !== 'LOBBY') return { ok: false, error: '이미 시작했어요.' };
        if (st.teamOrder.length < 2) return { ok: false, error: '팀이 2개 이상 필요해요. 팀장을 지정하거나 봇 팀을 추가해요.' };
        for (const id of st.teamOrder) { const t = st.teams[id]; if (!t.bot && !t.leaderId) return { ok: false, error: `${t.name} 팀에 팀장이 없어요.` }; }
        this.startMatch(0, now);
        return { ok: true };
      }
      case 'teacher:skipPhase': {
        if (st.phase === 'LOBBY' || st.phase === 'PODIUM') return { ok: false, error: '지금은 넘길 단계가 없어요.' };
        if (st.phase === 'BATTLE') return { ok: false, error: '전투 재생 중에는 넘길 수 없어요.' };
        st.deadline = now;
        this.tick(now);
        return { ok: true };
      }
      case 'teacher:endTournament': {
        if (st.phase === 'LOBBY') return { ok: false, error: '아직 시작하지 않았어요.' };
        if (st.match && st.phase !== 'PODIUM') this.endMatch(now, true);
        return { ok: true };
      }
      case 'teacher:kick': {
        const target = st.players[msg.playerId];
        if (!target || target.role !== 'student') return { ok: false, error: '학생을 찾을 수 없어요.' };
        const cur = target.teamId ? st.teams[target.teamId] : undefined;
        if (cur && cur.leaderId === target.id) {
          cur.leaderId = cur.members.find((m) => m !== target.id && st.players[m]?.role === 'student') ?? null;
        }
        this.movePlayer(target, null);
        delete st.players[target.id];
        this.effects.push({ type: 'kicked', playerId: target.id });
        return { ok: true };
      }
      case 'teacher:joinAsLeader': {
        const team = st.teams[msg.teamId];
        if (!team || team.bot) return { ok: false, error: '없는 팀이에요.' };
        if (p.teamId) this.restoreLeader(p);
        st.prevLeader[team.id] = team.leaderId;
        this.movePlayer(p, team.id);
        team.leaderId = p.id;
        return { ok: true };
      }
      case 'teacher:leaveLeader': {
        this.restoreLeader(p);
        return { ok: true };
      }
      case 'teacher:lock': { st.locked = msg.locked; return { ok: true }; }
      case 'teacher:reset': {
        st.phase = 'LOBBY'; st.phaseVersion++; st.deadline = null; st.match = null; st.history = []; st.segments = {};
        for (const id of st.teamOrder) {
          const t = st.teams[id];
          t.matchScore = 0; t.breakdown = { crown: 0, push: 0, capsule: 0 }; t.rankPoints = 0; t.matchResults = []; t.proposals = []; t.lockedPlan = null; t.buildReady = !!t.bot; t.energy = 0;
        }
        this.effects.push({ type: 'phase', phase: 'LOBBY' });
        return { ok: true };
      }
    }
    return { ok: false, error: '알 수 없는 요청이에요.' };
  }

  private restoreLeader(teacher: Player) {
    const st = this.state;
    if (!teacher.teamId) return;
    const team = st.teams[teacher.teamId];
    if (team) {
      const prev = st.prevLeader[team.id];
      team.leaderId = prev && team.members.includes(prev) ? prev : team.members.find((m) => m !== teacher.id) ?? null;
      delete st.prevLeader[team.id];
    }
    this.movePlayer(teacher, null);
  }

  private movePlayer(p: Player, teamId: string | null) {
    const st = this.state;
    if (p.teamId && st.teams[p.teamId]) {
      const old = st.teams[p.teamId];
      old.members = old.members.filter((m) => m !== p.id);
      old.proposals = old.proposals.filter((q) => q.by !== p.id);
      old.suggestions = old.suggestions.filter((s) => s.by !== p.id);
      if (old.leaderId === p.id) old.leaderId = null;
    }
    p.teamId = teamId;
    if (teamId && st.teams[teamId] && !st.teams[teamId].members.includes(p.id)) st.teams[teamId].members.push(p.id);
  }

  private createTeam(botLevel: BotLevel | null): Team {
    const st = this.state;
    const used = new Set(st.teamOrder.map((id) => st.teams[id].styleIndex));
    let styleIndex = 0; while (used.has(styleIndex)) styleIndex++;
    const usedNames = new Set(st.teamOrder.map((id) => st.teams[id].name));
    const bots = st.teamOrder.filter((id) => st.teams[id].bot).length;
    let name = botLevel ? BOT_NAMES[bots % BOT_NAMES.length] : TEAM_NAME_POOL.find((n) => !usedNames.has(n)) ?? `팀 ${styleIndex + 1}`;
    if (usedNames.has(name)) name = `${name} ${styleIndex + 1}`;
    const id = this.newId('t');
    const team: Team = {
      id, name, styleIndex, leaderId: null, bot: botLevel ? { level: botLevel, name } : null, members: [],
      build: botLevel ? buildForBot(bots, botLevel) : { ...PRESETS[0].build, utilities: [...PRESETS[0].build.utilities] },
      buildReady: !!botLevel, suggestions: [], proposals: [], lockedPlan: null, planSource: null, energy: 0, matchScore: 0,
      breakdown: { crown: 0, push: 0, capsule: 0 }, rankPoints: 0, matchResults: [], emote: null,
    };
    st.teams[id] = team; st.teamOrder.push(id);
    return team;
  }

  // ---------- 단계 진행 ----------
  private setPhase(phase: Phase, deadline: number | null) {
    this.state.phase = phase; this.state.phaseVersion++; this.state.deadline = deadline;
    this.effects.push({ type: 'phase', phase });
  }

  nextWakeAt(): number | null { return this.state.deadline; }

  /** 마감 도달 시 단계를 진행한다. 진행했으면 true. 중복 호출에 안전(마감 기준). */
  tick(now: number): boolean {
    const st = this.state;
    if (st.deadline === null || now < st.deadline) return false;
    switch (st.phase) {
      case 'BUILD': case 'PITSTOP': this.finishBuild(now); return true;
      case 'INTRO': this.startTurn(1, now); return true;
      case 'PLAN': this.resolvePlan(now); return true;
      case 'BATTLE': this.finishBattle(now); return true;
      default: st.deadline = null; return false;
    }
  }

  private humanTeams(): Team[] { return this.state.teamOrder.map((id) => this.state.teams[id]).filter((t) => !t.bot); }
  private allTeams(): Team[] { return this.state.teamOrder.map((id) => this.state.teams[id]); }

  private maybeAdvanceEarly(now: number) {
    const st = this.state;
    if (!st.settings.autoAdvance) return;
    if (st.phase === 'BUILD' || st.phase === 'PITSTOP') {
      if (this.humanTeams().every((t) => t.buildReady)) { st.deadline = Math.min(st.deadline ?? now, now + 1500); }
    } else if (st.phase === 'PLAN') {
      if (this.humanTeams().every((t) => t.lockedPlan)) { st.deadline = Math.min(st.deadline ?? now, now + 1200); }
    }
  }

  private startMatch(index: number, now: number) {
    const st = this.state;
    const arenaId = st.settings.matches === 1 ? CHAPTERS[0] : CHAPTERS[index % CHAPTERS.length];
    const arena = ARENAS[arenaId];
    const teams = this.allTeams();
    const robots: RobotSimState[] = teams.map((t, i) => {
      const pad = arena.startPads[i % arena.startPads.length];
      return { id: t.id, spec: deriveSpec(t.build), x: pad.x, y: pad.y, angle: pad.angle, vx: 0, vy: 0, w: 0, fallen: false, padIndex: i };
    });
    st.match = { index, arenaId, turn: 0, robots, capsules: [], crown: { x: arena.crown.x, y: arena.crown.y, vx: 0, vy: 0 }, capsuleSeq: 0, segmentId: null, startAt: null, revealedPlans: {}, turnScores: {}, seed: hashSeed(st.seed, index + 1, 991) };
    for (const t of teams) {
      t.matchScore = 0; t.breakdown = { crown: 0, push: 0, capsule: 0 }; t.proposals = []; t.lockedPlan = null; t.buildReady = !!t.bot; t.suggestions = [];
    }
    if (index === 0) this.setPhase('BUILD', now + st.settings.buildSeconds * 1000);
    else this.setPhase('PITSTOP', now + st.settings.pitstopSeconds * 1000);
  }

  private finishBuild(now: number) {
    const st = this.state; const m = st.match!;
    const arena = ARENAS[m.arenaId];
    for (const t of this.allTeams()) {
      if (!validateBuild(t.build).ok) t.build = { ...PRESETS[0].build, utilities: [...PRESETS[0].build.utilities] };
      const spec = deriveSpec(t.build);
      t.energy = spec.energyMax;
      const r = m.robots.find((x) => x.id === t.id)!;
      r.spec = spec;
      const pad = arena.startPads[r.padIndex % arena.startPads.length];
      r.x = pad.x; r.y = pad.y; r.angle = pad.angle; r.vx = 0; r.vy = 0; r.w = 0; r.fallen = false;
    }
    this.setPhase('INTRO', now + st.settings.introSeconds * 1000);
  }

  private startTurn(turn: number, now: number) {
    const st = this.state; const m = st.match!;
    const arena = ARENAS[m.arenaId];
    m.turn = turn;
    m.robots = respawnFallen(arena, m.robots);
    m.capsules = m.capsules.filter((c) => !c.taken);
    for (const s of arena.capsuleSpawns) if (s.turn === turn) m.capsules.push({ id: `c${++m.capsuleSeq}`, x: s.x, y: s.y, vx: 0, vy: 0, taken: false });
    m.turnScores = {}; m.revealedPlans = {}; m.segmentId = null; m.startAt = null;
    for (const t of this.allTeams()) {
      const spec = deriveSpec(t.build);
      if (turn > 1) t.energy = Math.min(spec.energyMax, t.energy + spec.energyRegen);
      t.proposals = []; t.lockedPlan = null;
    }
    this.setPhase('PLAN', now + st.settings.planSeconds * 1000);
    // 봇 명령은 즉시 결정(비공개)
    const teams = this.allTeams();
    for (const t of teams) {
      if (!t.bot) continue;
      const me = m.robots.find((r) => r.id === t.id)!;
      const plan = planForBot(t.bot.level, {
        arena, turn, me, others: m.robots.filter((r) => r.id !== t.id), capsules: m.capsules, crown: m.crown, energy: t.energy,
        seed: hashSeed(m.seed, turn, t.styleIndex + 1),
      });
      t.lockedPlan = plan;
    }
  }

  private resolvePlan(now: number) {
    const st = this.state; const m = st.match!;
    const arena = ARENAS[m.arenaId];
    const plans: Record<string, Plan> = {};
    for (const t of this.allTeams()) {
      // 우선순위: 팀장 확정 → 팀장의 마지막 배치(자동 제안) → 팀원 최다 득표 제안 → 안전 명령
      let plan: Plan | null = t.lockedPlan;
      t.planSource = plan ? 'locked' : null;
      if (!plan && t.leaderId) {
        const mine = t.proposals.find((q) => q.by === t.leaderId);
        if (mine && validatePlan(mine.plan, t.build, t.energy).ok) { plan = mine.plan; t.planSource = 'leader'; }
      }
      if (!plan && t.proposals.length) {
        const best = [...t.proposals].sort((a, b) => b.votes.length - a.votes.length || a.at - b.at)[0];
        if (validatePlan(best.plan, t.build, t.energy).ok) { plan = best.plan; t.planSource = 'vote'; }
      }
      if (!plan) { plan = [...SAFE_PLAN]; t.planSource = 'safe'; }
      plans[t.id] = plan;
      t.energy = Math.max(0, t.energy - planCost(plan, t.build));
    }
    const seed = hashSeed(m.seed, m.turn, 4242);
    const result = runSegment({ arena, turn: m.turn, robots: m.robots, capsules: m.capsules, plans, seed, crown: m.crown ?? { x: arena.crown.x, y: arena.crown.y, vx: 0, vy: 0 } });
    m.robots = result.robots; m.capsules = result.capsules; if (result.crown) m.crown = result.crown;
    m.revealedPlans = plans; m.turnScores = result.scores;
    for (const t of this.allTeams()) {
      const d = result.scores[t.id] ?? 0; t.matchScore += d;
      for (const e of result.events) if (e.type === 'score' && e.id === t.id) t.breakdown[e.reason] += e.delta;
    }
    const segmentId = `${m.index}-${m.turn}-${st.phaseVersion + 1}`;
    st.segments[segmentId] = result;
    const keys = Object.keys(st.segments);
    while (keys.length > MAX_SEGMENTS_KEPT) delete st.segments[keys.shift()!];
    m.segmentId = segmentId; m.startAt = now + 1500;
    this.setPhase('BATTLE', m.startAt + result.duration * 1000 + st.settings.resultSeconds * 1000);
    this.effects.push({ type: 'segment', segmentId });
  }

  private finishBattle(now: number) {
    const m = this.state.match!;
    if (m.turn < TURNS_PER_MATCH) this.startTurn(m.turn + 1, now);
    else this.endMatch(now, false);
  }

  private endMatch(now: number, forced: boolean) {
    const st = this.state; const m = st.match!;
    const teams = this.allTeams();
    const sorted = [...teams].sort((a, b) => b.matchScore - a.matchScore || b.breakdown.crown - a.breakdown.crown || b.breakdown.push - a.breakdown.push);
    const table = RANK_POINTS[Math.min(6, Math.max(2, teams.length))] ?? [1];
    const standings: { teamId: string; score: number; rank: number; points: number }[] = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (i > 0 && !(sorted[i - 1].matchScore === t.matchScore && sorted[i - 1].breakdown.crown === t.breakdown.crown && sorted[i - 1].breakdown.push === t.breakdown.push)) rank = i + 1;
      const points = table[Math.min(rank - 1, table.length - 1)] ?? 0;
      t.rankPoints += points;
      t.matchResults.push({ arenaId: m.arenaId, score: t.matchScore, rank, points });
      standings.push({ teamId: t.id, score: t.matchScore, rank, points });
    }
    st.history.push({ index: m.index, arenaId: m.arenaId, standings });
    const next = m.index + 1;
    if (!forced && next < st.settings.matches) this.startMatch(next, now);
    else { this.setPhase('PODIUM', null); }
  }

  // ---------- 뷰 ----------
  getSegment(id: string) { return this.state.segments[id] ?? null; }

  standings(): ClassView['standings'] {
    const teams = this.allTeams().map((t) => ({ teamId: t.id, rankPoints: t.rankPoints, totalScore: t.matchResults.reduce((s, r) => s + r.score, 0) + (this.state.phase !== 'PODIUM' && this.state.match ? t.matchScore : 0), rank: 0 }));
    teams.sort((a, b) => b.rankPoints - a.rankPoints || b.totalScore - a.totalScore);
    let rank = 1;
    teams.forEach((t, i) => { if (i > 0 && !(teams[i - 1].rankPoints === t.rankPoints && teams[i - 1].totalScore === t.totalScore)) rank = i + 1; t.rank = rank; });
    return teams;
  }

  viewFor(playerId: string | null, now: number): ClassView {
    const st = this.state;
    const me = playerId ? st.players[playerId] : undefined;
    const teams: TeamView[] = this.allTeams().map((t) => {
      const v: TeamView = {
        id: t.id, name: t.name, styleIndex: t.styleIndex, leaderId: t.leaderId,
        leaderNick: t.bot ? t.bot.name : (t.leaderId ? st.players[t.leaderId]?.nick ?? '?' : '미정'),
        members: t.members.map((id) => ({ id, nick: st.players[id]?.nick ?? '?', connected: !!st.players[id]?.connected })),
        bot: t.bot, build: t.build, buildReady: t.buildReady, energy: t.energy,
        planLocked: !!t.lockedPlan, proposalCount: t.proposals.length, planSource: t.planSource ?? null,
        matchScore: t.matchScore, breakdown: t.breakdown, rankPoints: t.rankPoints, matchResults: t.matchResults, emote: t.emote,
      };
      if (me && me.teamId === t.id) { v.proposals = t.proposals; v.lockedPlan = t.lockedPlan; v.suggestions = t.suggestions; }
      return v;
    });
    const m = st.match;
    return {
      code: st.code, phase: st.phase, phaseVersion: st.phaseVersion, deadline: st.deadline, serverNow: now, locked: st.locked,
      settings: st.settings,
      me: me ? { playerId: me.id, nick: me.nick, role: me.role, teamId: me.teamId, isLeader: !!me.teamId && st.teams[me.teamId]?.leaderId === me.id } : null,
      players: Object.values(st.players).map((p) => ({ id: p.id, nick: p.nick, role: p.role, teamId: p.teamId, connected: p.connected })),
      teams,
      match: m ? {
        index: m.index, arenaId: m.arenaId, turn: m.turn, totalTurns: TURNS_PER_MATCH,
        robots: m.robots.map((r) => ({ teamId: r.id, x: r.x, y: r.y, angle: r.angle, fallen: r.fallen, padIndex: r.padIndex })),
        capsules: m.capsules.map((c) => ({ id: c.id, x: c.x, y: c.y, taken: c.taken })),
        crown: m.crown ? { x: m.crown.x, y: m.crown.y } : { x: ARENAS[m.arenaId].crown.x, y: ARENAS[m.arenaId].crown.y },
        segmentId: m.segmentId, startAt: m.startAt,
        revealedPlans: st.phase === 'BATTLE' ? m.revealedPlans : {},
        turnScores: st.phase === 'BATTLE' ? m.turnScores : {},
      } : null,
      history: st.history, standings: this.standings(), chapterCount: st.settings.matches, teacherId: st.teacherId, versions: st.versions,
    };
  }
}

export function makeSettings(over: Partial<Settings> = {}): Settings {
  return { matches: 3, buildSeconds: DEFAULT_TIMING.buildSeconds, planSeconds: DEFAULT_TIMING.planSeconds, pitstopSeconds: DEFAULT_TIMING.pitstopSeconds, introSeconds: DEFAULT_TIMING.introSeconds, resultSeconds: DEFAULT_TIMING.resultSeconds, maxTeamSize: DEFAULT_MAX_TEAM_SIZE, autoAdvance: true, allowSpectateTeams: true, botLevel: 'normal', ...over };
}

export type { MatchState };
