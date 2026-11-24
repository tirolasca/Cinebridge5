import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tom: {
        neutro: 'border-line bg-surface2 text-muted',
        ok: 'border-ok/40 bg-ok/10 text-ok',
        aviso: 'border-warn/40 bg-warn/10 text-warn',
        erro: 'border-danger/40 bg-danger/10 text-danger',
        info: 'border-info/40 bg-info/10 text-info',
        destaque: 'border-accent/50 bg-accent/10 text-accent',
      },
    },
    defaultVariants: { tom: 'neutro' },
  },
);
export type TomBadge = NonNullable<VariantProps<typeof badge>['tom']>;
export const Badge = ({
  className,
  tom,
  ...p
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) => (
  <span className={cn(badge({ tom }), className)} {...p} />
);
