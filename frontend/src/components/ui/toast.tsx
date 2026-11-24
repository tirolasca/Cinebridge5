import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  tipo: 'ok' | 'erro';
  texto: string;
}
interface Ctx {
  ok: (t: string) => void;
  erro: (t: string) => void;
}
const C = createContext<Ctx | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Toast[]>([]);
  const add = useCallback((tipo: Toast['tipo'], texto: string) => {
    const id = ++seq;
    setItens((x) => [...x, { id, tipo, texto }]);
    setTimeout(() => setItens((x) => x.filter((i) => i.id !== id)), 5000);
  }, []);
  const valor = useMemo(
    () => ({ ok: (t: string) => add('ok', t), erro: (t: string) => add('erro', t) }),
    [add],
  );
  return (
    <C.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {itens.map((t) => (
          <div
            key={t.id}
            className={cn(
              'fade-up pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface px-3 py-2.5 text-sm shadow-lg',
              t.tipo === 'ok' ? 'border-ok/50' : 'border-danger/50',
            )}
          >
            {t.tipo === 'ok' ? (
              <CheckCircle2 className="mt-0.5 size-4 text-ok" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-4 text-danger" aria-hidden="true" />
            )}
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </C.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error('useToast fora do ToastProvider');
  return c;
}
