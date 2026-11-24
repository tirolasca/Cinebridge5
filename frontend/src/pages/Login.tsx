import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Loader2, Lock } from 'lucide-react';
import { Logo } from '@/components/comuns';
import { Button } from '@/components/ui/button';
import { Campo, Input } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';

export default function Login() {
  const { estado, login } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (estado === 'autenticado') return <Navigate to="/" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!usuario.trim() || !senha) {
      setErro('Informe usuário e senha.');
      return;
    }
    setEnviando(true);
    try {
      await login(usuario.trim(), senha);
      navegar((local.state as { de?: string } | null)?.de ?? '/', { replace: true });
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
          : e instanceof ApiError && e.status === 401
            ? 'Usuário ou senha inválidos.'
            : 'Não foi possível entrar agora. Tente novamente.',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="beam grid min-h-full place-items-center px-4 py-10">
      <div className="fade-up w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <form
          onSubmit={enviar}
          noValidate
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-xl"
          aria-labelledby="login-titulo"
        >
          <div>
            <h1 id="login-titulo" className="text-lg font-semibold">
              Acesso administrativo
            </h1>
            <p className="mt-1 text-sm text-muted">
              Entre para monitorar e administrar o ecossistema Cinebridge.
            </p>
          </div>
          <Campo rotulo="Usuário">
            {(p) => (
              <Input
                {...p}
                autoComplete="username"
                autoFocus
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="Senha">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            )}
          </Campo>
          {erro && (
            <p
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {erro}
            </p>
          )}
          <Button type="submit" variante="primario" className="w-full" disabled={enviando}>
            {enviando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="size-4" aria-hidden="true" />
            )}
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">
          Sessão protegida por cookie HttpOnly. Tentativas de login são limitadas.
        </p>
      </div>
    </main>
  );
}
