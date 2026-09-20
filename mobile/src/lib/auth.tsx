/** Session state shared across the app. */
import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearSession, http, restoreSession, saveSession, setUnauthorizedHandler } from './api';
import type { TokenResponse, User } from './types';

interface AuthValue {
  status: 'loading' | 'authenticated' | 'signed-out';
  user: User | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  const loadUser = useCallback(async () => {
    const me = await http.get<User>('/auth/me');
    setUser(me);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await restoreSession();
      if (!restored) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      try {
        await loadUser();
      } catch {
        // A stored token that no longer works means starting over.
        await clearSession();
        if (!cancelled) {
          setUser(null);
          setStatus('signed-out');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUser]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('signed-out');
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const tokens = await http.postPublic<TokenResponse>('/auth/login', {
        username: username.trim().toLowerCase(),
        password,
        device_name: 'Finman mobile',
      });
      await saveSession(tokens);
      await loadUser();
    },
    [loadUser],
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
    setStatus('signed-out');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, signIn, signOut, refreshUser: loadUser }),
    [status, user, signIn, signOut, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
