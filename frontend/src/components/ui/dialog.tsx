import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

/** Modal baseado em <dialog> nativo: foco preso, Esc e rótulos acessíveis sem dependências. */
export function Dialog({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!aberto && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-titulo"
      aria-describedby={descricao ? 'dlg-desc' : undefined}
      onClose={aoFechar}
      onClick={(e) => e.target === ref.current && aoFechar()}
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl"
    >
      {aberto && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="dlg-titulo" className="text-lg font-semibold">
                {titulo}
              </h2>
              {descricao && (
                <p id="dlg-desc" className="mt-1 text-sm text-muted">
                  {descricao}
                </p>
              )}
            </div>
            <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={aoFechar}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
