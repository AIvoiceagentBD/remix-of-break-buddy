import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export type AppRole = 'agent' | 'manager';

interface AuthState {
  user: User | null;
  profile: { display_name: string } | null;
  role: AppRole | null;
  loading: boolean;
  error: string | null;
}

const ROLE_CACHE_PREFIX = 'agent-auth-role:';

const isAppRole = (value: unknown): value is AppRole => value === 'agent' || value === 'manager';

const getProfileFromJwt = (user: User): { display_name: string } => ({
  display_name: user.user_metadata?.display_name ?? user.email ?? 'User',
});

const getRoleFromJwt = (user: User): AppRole | null => {
  const userMetadata = user.user_metadata as Record<string, unknown> | undefined;
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
  const candidate = userMetadata?.app_role ?? userMetadata?.role ?? appMetadata?.app_role;
  return isAppRole(candidate) ? candidate : null;
};

const readCachedRole = (userId: string): AppRole | null => {
  try {
    const value = localStorage.getItem(`${ROLE_CACHE_PREFIX}${userId}`);
    return isAppRole(value) ? value : null;
  } catch {
    return null;
  }
};

const writeCachedRole = (userId: string, role: AppRole) => {
  try {
    localStorage.setItem(`${ROLE_CACHE_PREFIX}${userId}`, role);
  } catch {}
};

export function useAgentAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, profile: null, role: null, loading: true, error: null,
  });

  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const activeUserIdRef = useRef<string | null>(null);

  const fetchRole = useCallback(async (user: User): Promise<void> => {
    const profile = getProfileFromJwt(user);
    const jwtRole = getRoleFromJwt(user);

    if (jwtRole) {
      writeCachedRole(user.id, jwtRole);
      if (mountedRef.current) {
        setState({ user, profile, role: jwtRole, loading: false, error: null });
      }
      return;
    }

    const cachedRole = readCachedRole(user.id);
    if (cachedRole) {
      if (mountedRef.current) {
        setState({ user, profile, role: cachedRole, loading: false, error: null });
      }
      return;
    }

    // Direct Supabase queries instead of edge function
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
      ]);

      const roleCandidate = roleResult.data?.role;
      if (isAppRole(roleCandidate)) {
        writeCachedRole(user.id, roleCandidate);
        if (mountedRef.current) {
          setState({
            user,
            profile: { display_name: profileResult.data?.display_name ?? profile.display_name },
            role: roleCandidate,
            loading: false,
            error: null,
          });
        }
        return;
      }
    } catch (err) {
      console.error('Role fetch error:', err);
    }

    if (mountedRef.current) {
      setState({
        user, profile, role: null, loading: false,
        error: 'Unable to determine your role. Please contact your manager.',
      });
    }
  }, []);

  const startRoleFetch = useCallback((user: User) => {
    if (activeUserIdRef.current === user.id && inFlightRef.current) return;
    activeUserIdRef.current = user.id;
    setState(s => ({ ...s, user, loading: true, error: null }));
    const fetchPromise = fetchRole(user).finally(() => {
      if (activeUserIdRef.current === user.id) inFlightRef.current = null;
    });
    inFlightRef.current = fetchPromise;
  }, [fetchRole]);

  useEffect(() => {
    mountedRef.current = true;

    const handleSessionUser = (sessionUser: User | null) => {
      if (!mountedRef.current) return;
      if (sessionUser) {
        startRoleFetch(sessionUser);
      } else {
        activeUserIdRef.current = null;
        inFlightRef.current = null;
        setState({ user: null, profile: null, role: null, loading: false, error: null });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSessionUser(session?.user ?? null);
    });

    supabase.auth.getSession()
      .then(({ data: { session } }) => handleSessionUser(session?.user ?? null))
      .catch(() => {
        setState({ user: null, profile: null, role: null, loading: false, error: 'Failed to initialize authentication.' });
      });

    return () => {
      mountedRef.current = false;
      inFlightRef.current = null;
      subscription.unsubscribe();
    };
  }, [startRoleFetch]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    activeUserIdRef.current = null;
    inFlightRef.current = null;
    setState({ user: null, profile: null, role: null, loading: false, error: null });
  }, []);

  return { user: state.user, profile: state.profile, role: state.role, loading: state.loading, error: state.error, login, logout };
}
