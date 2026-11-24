import { type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { botao } from './button-variants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof botao> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante, tamanho, type = 'button', ...p }, ref) => (
    <button ref={ref} type={type} className={cn(botao({ variante, tamanho }), className)} {...p} />
  ),
);
Button.displayName = 'Button';
