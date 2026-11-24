import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Skeleton = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface2', className)} {...p} />
);
