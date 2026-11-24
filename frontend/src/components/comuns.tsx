import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { Badge, type TomBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { EstadoServico } from '@/types/api';

export function Logo({ className, mostrarNome = true }: { className?: string; mostrarNome?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" role="img" aria-label="Cinebridge">
        <rect width="32" height="32" rx="8" fill="var(--bg-elev)" stroke="var(--border)" />
        <path
          d="M4 22c3-9 7-13 12-13s9 4 12 13"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path d="M4 22h24" stroke="var(--teal)" strokeWidth="2.6" strokeLinecap="round" />
        <g fill="var(--accent)">
          <rect x="9" y="22" width="2" height="4" rx=".6" />
          <rect x="15" y="22" width="2" height="4" rx=".6" />
          <rect x="21" y="22" width="2" height="4" rx=".6" />
        </g>
      </svg>
      {mostrarNome && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">Cinebridge</div>
          <div className="text-[11px] tracking-[0.18em] text-muted uppercase">Control Center</div>
        </div>
      )}
    </div>
  );
}

const ESTADOS: Record<
  EstadoServico | 'saudavel' | 'degradado' | 'critico',
  { tom: TomBadge; texto: string; cor: string }
> = {
  saudavel: { tom: 'ok', texto: 'Saudável', cor: 'bg-ok text-ok' },
  degradado: { tom: 'aviso', texto: 'Degradado', cor: 'bg-warn text-warn' },
  indisponivel: { tom: 'erro', texto: 'Indisponível', cor: 'bg-danger text-danger' },
  critico: { tom: 'erro', texto: 'Crítico', cor: 'bg-danger text-danger' },
};

/** Indicador de estado: cor + texto (nunca apenas cor). */
export function EstadoBadge({ estado }: { estado: keyof typeof ESTADOS }) {
  const e = ESTADOS[estado];
  return (
    <Badge tom={e.tom}>
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', e.cor.split(' ')[0], estado === 'saudavel' && 'pulse-dot')}
      />
      {e.texto}
    </Badge>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm text-muted">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: 'ok' | 'aviso' | 'erro';
}) {
  return (
    <Card className="fade-up p-4">
      <div className="text-xs font-medium text-muted">{rotulo}</div>
      <div
        className={cn(
          'tabular mt-1.5 text-2xl font-semibold tracking-tight',
          tom === 'ok' && 'text-ok',
          tom === 'aviso' && 'text-warn',
          tom === 'erro' && 'text-danger',
        )}
      >
        {valor}
      </div>
      {detalhe && <div className="mt-0.5 text-xs text-muted">{detalhe}</div>}
    </Card>
  );
}

export function EstadoVazio({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <Inbox className="size-8 text-muted" aria-hidden="true" />
      <p className="font-medium">{titulo}</p>
      {texto && <p className="max-w-md text-sm text-muted">{texto}</p>}
      {acao}
    </div>
  );
}

export function EstadoErro({ mensagem, aoTentar }: { mensagem: string; aoTentar?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-danger/40 bg-danger/5 px-6 py-10 text-center"
    >
      <AlertTriangle className="size-7 text-danger" aria-hidden="true" />
      <p className="font-medium">Não foi possível carregar os dados</p>
      <p className="max-w-md text-sm text-muted">{mensagem}</p>
      {aoTentar && (
        <Button tamanho="sm" onClick={aoTentar}>
          <RefreshCw className="size-3.5" aria-hidden="true" /> Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function CarregandoCards({ n = 4 }: { n?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export function CarregandoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="space-y-2">
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} className="h-11" />
      ))}
    </div>
  );
}

export function Paginacao({
  pagina,
  total,
  tamanho,
  aoMudar,
}: {
  pagina: number;
  total: number;
  tamanho: number;
  aoMudar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  if (total <= tamanho) return null;
  return (
    <nav aria-label="Paginação" className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
      <span className="tabular">
        {(pagina - 1) * tamanho + 1}–{Math.min(pagina * tamanho, total)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variante="secundario"
          tamanho="icone"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => aoMudar(pagina - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="tabular px-2">
          {pagina} / {paginas}
        </span>
        <Button
          variante="secundario"
          tamanho="icone"
          aria-label="Próxima página"
          disabled={pagina >= paginas}
          onClick={() => aoMudar(pagina + 1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export class LimiteDeErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }
  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Falha de renderização', erro, info.componentStack);
  }
  render() {
    if (this.state.erro)
      return (
        <EstadoErro
          mensagem="Ocorreu um erro inesperado nesta tela."
          aoTentar={() => this.setState({ erro: null })}
        />
      );
    return this.props.children;
  }
}
