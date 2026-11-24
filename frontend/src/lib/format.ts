const nf = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const num = (v: number | null | undefined, casas = 0): string =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : casas > 0
      ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
      : nf.format(v);

export const reais = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : brl.format(v);

export const pct = (v: number | null | undefined, casas = 1): string =>
  v === null || v === undefined
    ? '—'
    : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const ms = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? '—'
    : v >= 1000
      ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
      : `${Math.round(v)} ms`;

export const bytes = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '—';
  const un = ['B', 'KB', 'MB', 'GB', 'TB'];
  let x = v;
  let i = 0;
  while (x >= 1024 && i < un.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toLocaleString('pt-BR', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${un[i]}`;
};

export const dataHora = (iso: string | undefined | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
};

export const hora = (t: number | string): string =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function haQuanto(iso: string | undefined | null, agora = Date.now()): string {
  if (!iso) return '—';
  const s = Math.round((agora - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(s)) return '—';
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
