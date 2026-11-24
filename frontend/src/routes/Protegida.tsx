import { Navigate, Outlet, useLocation } from 'react-router';
import { Logo } from '@/components/comuns';
import { useAuth } from '@/hooks/useAuth';

/** A autorização real está no BFF (sessão no servidor); aqui só evitamos renderizar telas sem sessão. */
export function Protegida() {
  const { estado } = useAuth();
  const local = useLocation();
  if (estado === 'carregando')
    return (
      <div role="status" aria-label="Carregando" className="grid h-full place-items-center">
        <Logo className="animate-pulse" />
      </div>
    );
  if (estado === 'anonimo') return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return <Outlet />;
}
