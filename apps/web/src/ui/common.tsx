import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ALL_PARTS, COMMAND_CARDS, TEAM_STYLES, commandCost, type CommandId, type PartDef, type RobotBuild } from '@scrap/core';
import { assetUrl, loadImage, preload } from '../assets/loader';
import { renderRobotPreview } from '../render/RobotSprite';
import type { Toast } from '../state/store';

export function Scene({ bg, children, dim }: { bg?: string; children: React.ReactNode; dim?: boolean }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => { let alive = true; if (!bg) { setUrl(''); return; } loadImage(bg).then(() => { if (alive) setUrl(assetUrl(bg)); }).catch(() => {}); return () => { alive = false; }; }, [bg]);
  return (
    <div className="scene">
      <div className="scene-bg" style={{ backgroundImage: url ? `url(${url})` : undefined, opacity: url ? 1 : 0, filter: dim ? 'brightness(0.6)' : undefined }} />
      <div className="scene-body">{children}</div>
    </div>
  );
}

export function TopBar({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="topbar">
      <span className="title">{title}</span>
      {sub && <span className="sub">{sub}</span>}
      <span className="spacer" />
      {children}
    </div>
  );
}

export function Timer({ deadline, serverNow, total }: { deadline: number | null; serverNow: () => number; total?: number }) {
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 250); return () => clearInterval(id); }, []);
  if (deadline === null) return null;
  const remain = Math.max(0, deadline - serverNow());
  const sec = Math.ceil(remain / 1000);
  const pct = total ? Math.min(100, (remain / (total * 1000)) * 100) : 100;
  return (
    <div className={`timer ${sec <= 5 ? 'urgent' : ''}`} aria-live="polite" aria-label={`남은 시간 ${sec}초`}>
      <span>⏱ {sec}초</span>
      {total ? <span className="bar"><div style={{ width: `${pct}%` }} /></span> : null}
    </div>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}

export function Speaker({ who, image, text, style, onSkip }: { who: string; image: string; text: string; style?: React.CSSProperties; onSkip?: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { loadImage(image).then(() => setUrl(assetUrl(image))).catch(() => {}); }, [image]);
  return (
    <div className="speaker" style={style} onClick={onSkip} role={onSkip ? 'button' : undefined}>
      {url && <img src={url} alt={who} style={{ animation: 'bob 3s ease-in-out infinite' }} />}
      <div className="bubble"><div className="who">{who}</div>{text}{onSkip && <div className="small" style={{ color: '#9aa3b5', marginTop: 4 }}>탭하여 건너뛰기</div>}</div>
      <style>{`@keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }`}</style>
    </div>
  );
}

export function TeamBadge({ styleIndex, size = 26 }: { styleIndex: number; size?: number }) {
  const s = TEAM_STYLES[styleIndex % TEAM_STYLES.length];
  return <span className="badge-num" style={{ background: s.color, width: size, height: size, fontSize: size * 0.5 }} aria-label={`${s.name} ${s.index}번 팀`}>{s.index}</span>;
}

export function Gauges({ part }: { part: PartDef }) {
  return (
    <div className="gauges">
      {part.gauges.map(([label, v]) => (
        <span key={label} className="gauge" title={`${label} ${v}/5`}>{label} {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? 'on' : ''} />)}</span>
      ))}
    </div>
  );
}

export function PartCard({ id, selected, disabled, onClick, note }: { id: string; selected?: boolean; disabled?: boolean; onClick?: () => void; note?: string }) {
  const p = ALL_PARTS[id];
  if (!p) return null;
  return (
    <button type="button" className={`part-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={selected} title={p.short}>
      <img src={assetUrl(id)} alt={p.name} loading="lazy" />
      <span className="name">{p.name}</span>
      <Gauges part={p} />
      <span className="small muted" style={{ fontSize: 11 }}>무게 {p.mass}{note ? ` · ${note}` : ''}</span>
    </button>
  );
}

export function CommandIcon({ id, build }: { id: CommandId; build?: RobotBuild }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'FWD': return <svg viewBox="0 0 40 40" aria-hidden><path d="M20 33V8M9 19l11-11 11 11" {...stroke} /></svg>;
    case 'BACK': return <svg viewBox="0 0 40 40" aria-hidden><path d="M20 7v25M9 21l11 11 11-11" {...stroke} /></svg>;
    case 'LEFT': return <svg viewBox="0 0 40 40" aria-hidden><path d="M30 32V20a9 9 0 0 0-9-9H9M15 5l-7 6 7 6" {...stroke} /></svg>;
    case 'RIGHT': return <svg viewBox="0 0 40 40" aria-hidden><path d="M10 32V20a9 9 0 0 1 9-9h12M25 5l7 6-7 6" {...stroke} /></svg>;
    case 'BRAKE': return <svg viewBox="0 0 40 40" aria-hidden><path d="M13 5h14l8 8v14l-8 8H13l-8-8V13z" {...stroke} /><path d="M14 20h12" {...stroke} /></svg>;
    case 'WAIT': return <svg viewBox="0 0 40 40" aria-hidden><circle cx="20" cy="20" r="14" {...stroke} /><path d="M20 11v9l6 4" {...stroke} /></svg>;
    case 'FRONT': return build ? <img src={assetUrl(build.front)} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} /> : <svg viewBox="0 0 40 40"><path d="M6 12h28M10 12v10M30 12v10M14 22h12" {...stroke} /></svg>;
    case 'UTIL_A': case 'UTIL_B': {
      const u = build?.utilities[id === 'UTIL_A' ? 0 : 1];
      return u ? <img src={assetUrl(u)} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} /> : <svg viewBox="0 0 40 40"><rect x="8" y="8" width="24" height="24" rx="5" {...stroke} /><path d="M14 20h12" {...stroke} /></svg>;
    }
  }
}

export function commandLabel(id: CommandId, build?: RobotBuild): string {
  if (build && id === 'FRONT') return ALL_PARTS[build.front]?.name ?? '전면';
  if (build && (id === 'UTIL_A' || id === 'UTIL_B')) { const u = build.utilities[id === 'UTIL_A' ? 0 : 1]; if (u) return ALL_PARTS[u]?.name ?? '보조'; }
  return COMMAND_CARDS[id].label;
}

export function CommandCard({ id, build, onClick, disabled, selected }: { id: CommandId; build: RobotBuild; onClick?: () => void; disabled?: boolean; selected?: boolean }) {
  const c = commandCost(id, build);
  const unusable = c.cost === null;
  const label = commandLabel(id, build);
  return (
    <button type="button" className={`cmd-card ${unusable || disabled ? 'disabled' : ''} ${selected ? 'selected' : ''}`} onClick={onClick} disabled={unusable || disabled}
      title={unusable ? c.reason : COMMAND_CARDS[id].hint} aria-label={`${label} ${unusable ? c.reason : `에너지 ${c.cost}`}`} style={selected ? { borderColor: '#ffb84d' } : undefined}>
      <CommandIcon id={id} build={build} />
      <span>{label}</span>
      <span className="cost">{unusable ? '사용 불가' : `⚡${c.cost}`}</span>
    </button>
  );
}

export function RobotPreview({ build, styleIndex, number, size = 220, angle = 0 }: { build: RobotBuild; styleIndex: number; number: number; size?: number; angle?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(build);
  useEffect(() => {
    let alive = true;
    preload([build.chassis, build.drive, build.front, ...build.utilities]).then(() => { if (alive && ref.current) renderRobotPreview(ref.current, build, styleIndex, number, angle); });
    return () => { alive = false; };
  }, [key, styleIndex, number, angle, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-label="내 로봇 미리보기" />;
}

export function QR({ text, size = 200 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, text, { width: size, margin: 1, color: { dark: '#0b1424', light: '#ffffff' } }).catch(() => {}); }, [text, size]);
  return <canvas ref={ref} style={{ borderRadius: 10, background: '#fff' }} aria-label="입장 QR 코드" />;
}

export function RotateHint() {
  return <div className="rotate-hint">📱 화면을 가로로 돌려주세요.<br />경기장은 가로 화면에서 보여요.</div>;
}

/** 받침에 따라 조사를 고른다. 한글이 아니면 '이(가)' 꼴로 병기 */
export function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}${withBatchim}(${without})`;
  return word + ((code - 0xac00) % 28 !== 0 ? withBatchim : without);
}

export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}
