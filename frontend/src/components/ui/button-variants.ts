import { cva } from 'class-variance-authority';

export const botao = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variante: {
        primario: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 font-semibold',
        secundario: 'bg-surface2 text-fg border border-line hover:border-accent/60',
        fantasma: 'text-muted hover:text-fg hover:bg-surface2',
        perigo: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
      },
      tamanho: { sm: 'h-8 px-3', md: 'h-10 px-4', icone: 'h-9 w-9' },
    },
    defaultVariants: { variante: 'secundario', tamanho: 'md' },
  },
);
