import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUserDto, RoleCode } from '@plataforma/shared';
import { login as apiLogin, me } from './api';

type AuthState = {
  user: AuthUserDto | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: RoleCode[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('sv_token');
    if (!t) {
      setLoading(false);
      return;
    }
    me()
      .then(setUser)
      .catch(() => localStorage.removeItem('sv_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await apiLogin(username, password);
    localStorage.setItem('sv_token', res.accessToken);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('sv_token');
    setUser(null);
  }

  function hasRole(...roles: RoleCode[]) {
    if (!user) return false;
    return roles.some((r) => user.roles.includes(r));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
