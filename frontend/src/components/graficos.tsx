import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hora } from '@/lib/format';

const eixo = { stroke: 'var(--muted)', fontSize: 11, tickLine: false, axisLine: false } as const;
const dica = {
  contentStyle: {
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
  },
} as const;

export function GraficoDisponibilidade({ dados }: { dados: { t: number; v: number }[] }) {
  const pontos = dados.map((d) => ({ t: d.t, v: Math.round(d.v * 1000) / 10 }));
  return (
    <div role="img" aria-label="Disponibilidade dos serviços nas últimas 24 horas" className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="gDisp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={hora} minTickGap={48} {...eixo} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} unit="%" {...eixo} />
          <Tooltip
            {...dica}
            labelFormatter={(t) => hora(Number(t))}
            formatter={(v) => [`${v}%`, 'Disponibilidade']}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#gDisp)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoBarras({
  dados,
  rotulo,
  unidade,
}: {
  dados: { nome: string; valor: number | null }[];
  rotulo: string;
  unidade: string;
}) {
  const pontos = dados.map((d) => ({ nome: d.nome, valor: d.valor ?? 0 }));
  return (
    <div role="img" aria-label={rotulo} className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="nome" {...eixo} />
          <YAxis unit={unidade} {...eixo} />
          <Tooltip
            {...dica}
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(v) => [`${v}${unidade}`, rotulo]}
          />
          <Bar dataKey="valor" fill="var(--teal)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
