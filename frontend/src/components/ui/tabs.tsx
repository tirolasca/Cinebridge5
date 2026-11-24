import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AbaDef {
  id: string;
  rotulo: string;
}

/** Abas acessíveis (role=tablist, setas/Home/End). O conteúdo é renderizado pelo chamador conforme a aba ativa. */
export function Abas({
  abas,
  ativa,
  aoMudar,
  children,
}: {
  abas: AbaDef[];
  ativa: string;
  aoMudar: (id: string) => void;
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tecla = (e: KeyboardEvent, i: number) => {
    const n = abas.length;
    const alvo =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (alvo < 0) return;
    e.preventDefault();
    aoMudar(abas[alvo]!.id);
    refs.current[alvo]?.focus();
  };
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {abas.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${base}-${a.id}`}
            aria-selected={ativa === a.id}
            aria-controls={`${base}-painel`}
            tabIndex={ativa === a.id ? 0 : -1}
            onClick={() => aoMudar(a.id)}
            onKeyDown={(e) => tecla(e, i)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              ativa === a.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-${ativa}`} className="pt-5">
        {children}
      </div>
    </div>
  );
}
