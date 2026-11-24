import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CabecalhoPagina, CarregandoTabela, EstadoErro, EstadoVazio } from '@/components/comuns';
import { GraficoBarras } from '@/components/graficos';
import { Badge, type TomBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { Abas } from '@/components/ui/tabs';
import { useLinks, useLogs, useMetricas, useTraces } from '@/hooks/queries';
import { bytes, dataHora, ms, num, pct } from '@/lib/format';

const ABAS = [
  { id: 'metricas', rotulo: 'Métricas' },
  { id: 'logs', rotulo: 'Logs' },
  { id: 'traces', rotulo: 'Traces' },
  { id: 'dashboards', rotulo: 'Dashboards' },
];
const SERVICOS = [
  'cinebridge-api',
  'cinebridge-profissionais',
  'cinebridge-projetos',
  'cinebridge-notificacoes',
  'cinebridge-governanca',
];
const TOM: Record<string, TomBadge> = {
  fatal: 'erro',
  error: 'erro',
  warn: 'aviso',
  info: 'info',
  debug: 'neutro',
};

export default function Observabilidade() {
  const [aba, setAba] = useState('metricas');
  return (
    <>
      <CabecalhoPagina
        titulo="Observabilidade"
        descricao="Métricas (Prometheus), logs (Loki) e traces (Jaeger) consultados pelo servidor. O painel não executa consultas arbitrárias."
      />
      <Abas abas={ABAS} ativa={aba} aoMudar={setAba}>
        {aba === 'metricas' && <AbaMetricas />}
        {aba === 'logs' && <AbaLogs />}
        {aba === 'traces' && <AbaTraces />}
        {aba === 'dashboards' && <AbaDashboards />}
      </Abas>
    </>
  );
}

function AbaMetricas() {
  const { data, isPending, isError, error, refetch } = useMetricas();
  if (isPending) return <CarregandoTabela />;
  if (isError) return <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />;
  if (!data.prometheusDisponivel)
    return (
      <EstadoVazio
        titulo="Prometheus indisponível"
        texto="Não foi possível obter métricas. Verifique se o Prometheus está em execução e coletando os serviços."
      />
    );
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latência p95 por serviço (ms)</CardTitle>
          </CardHeader>
          <CardBody>
            <GraficoBarras
              rotulo="Latência p95"
              unidade=" ms"
              dados={data.servicos.map((s) => ({ nome: s.nome, valor: s.latenciaP95Ms }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CPU média por serviço (% de 1 núcleo)</CardTitle>
          </CardHeader>
          <CardBody>
            <GraficoBarras
              rotulo="CPU"
              unidade="%"
              dados={data.servicos.map((s) => ({ nome: s.nome, valor: s.cpuPct }))}
            />
          </CardBody>
        </Card>
      </div>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Serviço</Th>
              <Th className="text-right">p50</Th>
              <Th className="text-right">p95</Th>
              <Th className="text-right">Erros 5xx</Th>
              <Th className="text-right">Req/s</Th>
              <Th className="text-right">CPU</Th>
              <Th className="text-right">Heap</Th>
            </tr>
          </thead>
          <tbody>
            {data.servicos.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.nome}</Td>
                <Td className="tabular text-right">{ms(s.latenciaP50Ms)}</Td>
                <Td className="tabular text-right">{ms(s.latenciaP95Ms)}</Td>
                <Td
                  className={`tabular text-right ${s.taxaErros && s.taxaErros > 0.05 ? 'text-danger' : ''}`}
                >
                  {pct(s.taxaErros, 2)}
                </Td>
                <Td className="tabular text-right">{num(s.reqPorSegundo, 2)}</Td>
                <Td className="tabular text-right">{s.cpuPct === null ? '—' : `${num(s.cpuPct, 1)}%`}</Td>
                <Td className="tabular text-right">{bytes(s.heapBytes)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}

function AbaLogs() {
  const [servico, setServico] = useState('');
  const [nivel, setNivel] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const { data, isPending, isError, error, refetch } = useLogs({
    servico: servico || undefined,
    nivel: nivel || undefined,
    busca: buscaAplicada || undefined,
  });
  const links = useLinks();

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscaAplicada(busca.trim());
        }}
      >
        <Select
          aria-label="Serviço"
          className="w-52"
          value={servico}
          onChange={(e) => setServico(e.target.value)}
        >
          <option value="">Todos os serviços</option>
          {SERVICOS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Nível" className="w-40" value={nivel} onChange={(e) => setNivel(e.target.value)}>
          <option value="">Todos os níveis</option>
          {['debug', 'info', 'warn', 'error', 'fatal'].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </Select>
        <Input
          aria-label="Buscar no texto"
          placeholder="Buscar no texto (Enter)…"
          className="min-w-56 flex-1"
          maxLength={80}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </form>
      {isPending && <CarregandoTabela />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && data.linhas.length === 0 && (
        <EstadoVazio titulo="Nenhum log encontrado" texto="Tente ampliar os filtros. Logs da última hora." />
      )}
      {data && data.linhas.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line font-mono text-xs">
          {data.linhas.map((l, i) => (
            <li key={`${l.em}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
              <time dateTime={l.em} className="shrink-0 text-muted">
                {dataHora(l.em)}
              </time>
              <Badge tom={TOM[l.nivel] ?? 'neutro'}>{l.nivel}</Badge>
              <span className="shrink-0 text-teal">{l.servico}</span>
              <span className="min-w-0 flex-1 break-words">{l.mensagem}</span>
              {l.correlationId &&
                (links.data ? (
                  <a
                    className="shrink-0 text-accent hover:underline"
                    href={`${links.data.jaeger}/trace/${l.correlationId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Abrir trace no Jaeger"
                  >
                    trace {l.correlationId.slice(0, 8)}…
                  </a>
                ) : (
                  <span className="shrink-0 text-muted">trace {l.correlationId.slice(0, 8)}…</span>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaTraces() {
  const [servico, setServico] = useState('cinebridge-api');
  const { data, isPending, isError, error, refetch } = useTraces(servico);
  return (
    <div className="space-y-4">
      <Select
        aria-label="Serviço"
        className="w-60"
        value={servico}
        onChange={(e) => setServico(e.target.value)}
      >
        {SERVICOS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
      {isPending && <CarregandoTabela />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && data.traces.length === 0 && (
        <EstadoVazio
          titulo="Nenhum trace na última hora"
          texto="Gere tráfego (por exemplo, uma recomendação) e atualize."
        />
      )}
      {data && data.traces.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Operação raiz</Th>
                <Th>Serviços</Th>
                <Th className="text-right">Spans</Th>
                <Th className="text-right">Duração</Th>
                <Th>Início</Th>
                <Th>Trace</Th>
              </tr>
            </thead>
            <tbody>
              {data.traces.map((t) => (
                <tr key={t.traceId}>
                  <Td className="font-medium">
                    {t.raiz} {t.erros > 0 && <Badge tom="erro">{t.erros} erro(s)</Badge>}
                  </Td>
                  <Td className="text-xs text-muted">
                    {t.servicos.map((s) => s.replace('cinebridge-', '')).join(' → ')}
                  </Td>
                  <Td className="tabular text-right">{t.spans}</Td>
                  <Td className="tabular text-right">{ms(t.duracaoMs)}</Td>
                  <Td className="text-muted">{dataHora(t.inicio)}</Td>
                  <Td>
                    <a
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                      href={`${data.jaegerUrl}/trace/${t.traceId}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t.traceId.slice(0, 8)}… <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

function AbaDashboards() {
  const { data, isPending, isError, error, refetch } = useLinks();
  if (isPending) return <CarregandoTabela linhas={3} />;
  if (isError) return <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {data.dashboards.map((d) => (
        <a
          key={d.nome}
          href={d.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent/60"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{d.nome}</span>
            <ExternalLink className="size-4 text-muted group-hover:text-accent" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs text-muted">Abre no Grafana (login próprio).</p>
        </a>
      ))}
      <p className="text-xs text-muted md:col-span-3">
        Grafana: <span className="font-mono">{data.grafana}</span> · Jaeger:{' '}
        <span className="font-mono">{data.jaeger}</span>. Disponíveis no ambiente local completo ou com o
        profile de observabilidade em produção.
      </p>
    </div>
  );
}
