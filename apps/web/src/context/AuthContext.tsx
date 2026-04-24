'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AuthUser, clearTokens, getSessionUser, saveTokens } from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(getSessionUser());
    setIsLoading(false);
  }, []);

  const login = useCallback((accessToken: string, refreshToken: string) => {
    saveTokens(accessToken, refreshToken);
    setUser(getSessionUser());
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
