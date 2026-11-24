import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const TableWrap = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('w-full overflow-x-auto rounded-xl border border-line', className)} {...p} />
);
export const Table = ({ className, ...p }: HTMLAttributes<HTMLTableElement>) => (
  <table className={cn('w-full border-collapse text-sm', className)} {...p} />
);
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'bg-surface2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap',
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-t border-line px-4 py-3 align-middle', className)} {...p} />
);
