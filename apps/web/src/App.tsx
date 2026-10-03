import React, { useEffect, useMemo, useState } from 'react';
import { Entrance } from './screens/Entrance';
import { Join } from './screens/Join';
import { Solo } from './screens/Solo';
import { TeacherRoute } from './screens/Teacher';
import { StudentPlay } from './screens/StudentPlay';
import { RotateHint } from './ui/common';

export function navigate(path: string) { history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }

export function usePath(): string {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => { const on = () => setPath(location.pathname + location.search); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  return path;
}

export interface StudentSession { code: string; token: string; playerId: string; nick: string; savedAt?: number }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 클래스 보관 기간과 같게: 공용 PC 에서 오래된 자리로 들어가지 않게
export const sessionStore = {
  get(): StudentSession | null {
    try {
      const raw = localStorage.getItem('sc:session'); if (!raw) return null;
      const s = JSON.parse(raw) as StudentSession;
      if (!s.savedAt || Date.now() - s.savedAt > SESSION_TTL_MS) { localStorage.removeItem('sc:session'); return null; }
      return s;
    } catch { return null; }
  },
  set(s: StudentSession | null) { try { if (s) localStorage.setItem('sc:session', JSON.stringify({ ...s, savedAt: Date.now() })); else localStorage.removeItem('sc:session'); } catch { /* noop */ } },
};

export function App() {
  const path = usePath();
  const url = useMemo(() => new URL(path, location.origin), [path]);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  let screen: React.ReactNode;
  if (p === '/join') screen = <Join code={url.searchParams.get('code') ?? ''} />;
  else if (p === '/solo') screen = <Solo />;
  else if (p === '/teacher' || p.startsWith('/teacher/')) screen = <TeacherRoute />;
  else if (p === '/play') screen = <StudentPlay />;
  else screen = <Entrance />;
  return <>{screen}<RotateHint /></>;
}
