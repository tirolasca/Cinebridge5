import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  Activity,
  Clapperboard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { Logo } from '@/components/comuns';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', rotulo: 'Visão geral', icone: LayoutDashboard, fim: true },
  { to: '/servicos', rotulo: 'Serviços', icone: Server },
  { to: '/profissionais', rotulo: 'Profissionais', icone: Users },
  { to: '/projetos', rotulo: 'Projetos', icone: Clapperboard },
  { to: '/recomendacoes', rotulo: 'Recomendações', icone: Sparkles },
  { to: '/mensageria', rotulo: 'Mensageria', icone: MessagesSquare },
  { to: '/observabilidade', rotulo: 'Observabilidade', icone: Activity },
  { to: '/governanca', rotulo: 'Governança', icone: ShieldCheck },
];

export function AppShell() {
  const [aberto, setAberto] = useState(false);
  const { tema, alternar } = useTheme();
  const { usuario, logout } = useAuth();

  return (
    <div className="flex min-h-full bg-bg">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      {aberto && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-hidden="true"
          onClick={() => setAberto(false)}
        />
      )}

      <aside
        id="menu-lateral"
        aria-label="Navegação principal"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-elev transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          aberto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center border-b border-line px-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map(({ to, rotulo, icone: Icone, fim }) => (
            <NavLink
              key={to}
              to={to}
              end={fim}
              onClick={() => setAberto(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface2 hover:text-fg',
                )
              }
            >
              <Icone className="size-[18px]" aria-hidden="true" />
              {rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="filmstrip h-6 border-t border-line opacity-60" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 border-t border-line p-3">
          <div className="min-w-0 text-xs">
            <div className="truncate font-medium">{usuario}</div>
            <div className="text-muted">Administrador</div>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Sair" onClick={() => void logout()}>
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-elev/85 px-4 backdrop-blur lg:px-8">
          <Button
            variante="fantasma"
            tamanho="icone"
            className="lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={aberto}
            aria-controls="menu-lateral"
            onClick={() => setAberto(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
            <ScrollText className="size-3.5" aria-hidden="true" /> Plataforma de formação de equipes
            audiovisuais
          </div>
          <Button
            variante="fantasma"
            tamanho="icone"
            onClick={alternar}
            aria-label={tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          >
            {tema === 'dark' ? (
              <Sun className="size-[18px]" aria-hidden="true" />
            ) : (
              <Moon className="size-[18px]" aria-hidden="true" />
            )}
          </Button>
        </div>
        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
