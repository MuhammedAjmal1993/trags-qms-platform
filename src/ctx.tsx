import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';
import type { RegisterConfig } from '../shared/registers';

export interface User {
  id: number; email: string; name: string; title: string | null; site: string | null;
  role: string; permissions: Record<string, string[]>; must_change_pw: number;
}

interface Ctx {
  user: User | null; loading: boolean; needsSetup: boolean;
  registers: (RegisterConfig & { count: number })[];
  refresh: () => Promise<void>; refreshRegisters: () => Promise<void>;
  can: (module: string, action?: string) => boolean;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [registers, setRegisters] = useState<(RegisterConfig & { count: number })[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 3500);
  }, []);

  const refreshRegisters = useCallback(async () => {
    try { setRegisters(await api.get('/api/registers')); } catch { /* not signed in */ }
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.get('/api/auth/status');
    setNeedsSetup(!!s.needsSetup);
    setUser(s.user);
    if (s.user && !s.user.must_change_pw) await refreshRegisters();
    setLoading(false);
  }, [refreshRegisters]);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
    const exp = () => { setUser(null); };
    window.addEventListener('auth:expired', exp);
    return () => window.removeEventListener('auth:expired', exp);
  }, [refresh]);

  const can = useCallback((module: string, action = 'view') => !!user?.permissions?.[module]?.includes(action), [user]);

  return (
    <AppCtx.Provider value={{ user, loading, needsSetup, registers, refresh, refreshRegisters, can, toast }}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>
    </AppCtx.Provider>
  );
}
