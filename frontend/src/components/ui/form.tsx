import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-line bg-bg-elev px-3 text-sm text-fg placeholder:text-muted/70 focus-visible:border-accent disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(base, 'h-10', className)} {...p} />,
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} className={cn(base, 'h-10 pr-8', className)} {...p} />,
);
Select.displayName = 'Select';

/** Rótulo + controle + erro, com ids ligados (acessibilidade). */
export function Campo({
  rotulo,
  erro,
  dica,
  children,
}: {
  rotulo: string;
  erro?: string;
  dica?: string;
  children: (p: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const desc = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {rotulo}
      </label>
      {children({ id, 'aria-invalid': erro ? true : undefined, 'aria-describedby': desc })}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-xs text-danger">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="text-xs text-muted">
          {dica}
        </p>
      ) : null}
    </div>
  );
}
