import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'documentacao' | 'financeiro' | 'consultor' | 'rh' | 'prospector' | 'celular' | 'ponto';

export interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  status: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Usuário só com a função "ponto" = celular compartilhado de bater ponto. */
export const somentePonto = (roles: UserRole[]) => roles.length > 0 && roles.every((r) => r === 'ponto');

const homeForRoles = (roles: UserRole[]) => {
  if (somentePonto(roles)) return '/quiosque';
  if (roles.includes('admin')) return '/';
  if (roles.includes('documentacao')) return '/clientes';
  if (roles.includes('financeiro')) return '/financeiro';
  if (roles.includes('consultor')) return '/imoveis';
  if (roles.includes('rh')) return '/funcionarios';
  if (roles.includes('prospector')) return '/prospeccao';
  return '/';
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadUserData = useCallback(async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('id, nome, email, telefone, status').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    const p = (profileRes.data as Profile) ?? null;
    const r = ((rolesRes.data as { role: UserRole }[]) ?? []).map((x) => x.role);
    setProfile(p);
    setRoles(r);
    return { profile: p, roles: r };
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const { profile } = await loadUserData(session.user.id);
        if (profile && profile.status !== 'ativo') {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setRoles([]);
        }
      }
      if (active) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setRoles([]);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { error: 'Email ou senha incorretos' };

    const { profile, roles } = await loadUserData(data.user.id);
    if (!profile || profile.status !== 'ativo') {
      await supabase.auth.signOut();
      return { error: 'Seu acesso está desativado. Fale com o administrador.' };
    }
    if (roles.length === 0) {
      await supabase.auth.signOut();
      return { error: 'Seu usuário ainda não tem cargo definido. Fale com o administrador.' };
    }

    const params = new URLSearchParams(window.location.search);
    const rawNext = params.get('next');
    const safeNext = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
    navigate(safeNext || homeForRoles(roles), { replace: true });
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    navigate('/login', { replace: true });
  };

  const hasRole = (required: UserRole) => roles.includes('admin') || roles.includes(required);

  const refreshProfile = async () => {
    if (user) await loadUserData(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signIn, signOut, hasRole, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
