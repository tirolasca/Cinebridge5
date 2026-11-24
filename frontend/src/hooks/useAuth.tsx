import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, aoExpirarSessao, definirCsrf } from '@/services/api';

type Estado = 'carregando' | 'autenticado' | 'anonimo';
interface AuthCtx {
  estado: Estado;
  usuario: string | null;
  login: (usuario: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [usuario, setUsuario] = useState<string | null>(null);

  const limpar = useCallback(() => {
    definirCsrf(null);
    setUsuario(null);
    setEstado('anonimo');
    qc.clear(); // nenhum dado da sessão anterior permanece em cache
  }, [qc]);

  useEffect(() => {
    aoExpirarSessao(limpar);
    api
      .me()
      .then((s) => {
        definirCsrf(s.csrf);
        setUsuario(s.usuario);
        setEstado('autenticado');
      })
      .catch(() => setEstado('anonimo'));
    return () => aoExpirarSessao(null);
  }, [limpar]);

  const login = useCallback(async (u: string, senha: string) => {
    const s = await api.login(u, senha);
    definirCsrf(s.csrf);
    setUsuario(s.usuario);
    setEstado('autenticado');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      limpar();
    }
  }, [limpar]);

  const valor = useMemo(() => ({ estado, usuario, login, logout }), [estado, usuario, login, logout]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
