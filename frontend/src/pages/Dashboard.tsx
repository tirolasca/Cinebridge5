import { RadioTower, WifiOff } from 'lucide-react';
import {
  CabecalhoPagina,
  CarregandoCards,
  EstadoBadge,
  EstadoErro,
  EstadoVazio,
  Kpi,
} from '@/components/comuns';
import { GraficoDisponibilidade } from '@/components/graficos';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useOverview, type Conexao } from '@/hooks/useOverview';
import { bytes, haQuanto, ms, num, pct } from '@/lib/format';
import type { Overview } from '@/types/api';

const CONEXAO: Record<Conexao, { texto: string; tom: 'ok' | 'aviso' | 'neutro' }> = {
  'ao-vivo': { texto: 'Ao vivo', tom: 'ok' },
  conectando: { texto: 'Conectando…', tom: 'neutro' },
  reconectando: { texto: 'Reconectando…', tom: 'aviso' },
  polling: { texto: 'Atualização a cada 30 s', tom: 'aviso' },
};

const BANNER: Record<Overview['saude']['estado'], string> = {
  saudavel: 'Todos os serviços estão operando normalmente.',
  degradado: 'Um ou mais serviços apresentam problemas.',
  critico: 'Falha crítica: a API ou vários serviços estão indisponíveis.',
};

export default function Dashboard() {
  const { data: o, isPending, isError, error, refetch, conexao } = useOverview();
  const c = CONEXAO[conexao];

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao="Saúde do ecossistema e indicadores em tempo real, lidos das fontes reais (serviços, Prometheus, RabbitMQ e governança)."
        acoes={
          <Badge tom={c.tom} aria-live="polite">
            {conexao === 'polling' ? (
              <WifiOff className="size-3" aria-hidden="true" />
            ) : (
              <RadioTower className="size-3" aria-hidden="true" />
            )}
            {c.texto}
          </Badge>
        }
      />

      {isPending && <CarregandoCards n={8} />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}

      {o && (
        <div className="space-y-6">
          <section
            aria-label="Saúde geral"
            className={`beam fade-up rounded-xl border p-5 ${o.saude.estado === 'saudavel' ? 'border-ok/40' : o.saude.estado === 'degradado' ? 'border-warn/50' : 'border-danger/50'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <EstadoBadge estado={o.saude.estado} />
                  <span className="tabular text-sm text-muted">
                    {o.saude.ok} de {o.saude.total} serviços saudáveis
                  </span>
                </div>
                <p className="mt-2 text-lg font-medium">{BANNER[o.saude.estado]}</p>
              </div>
              <div className="text-xs text-muted">Atualizado {haQuanto(o.geradoEm)}</div>
            </div>
            {(!o.fontes.prometheus || !o.fontes.rabbitmq || !o.fontes.governanca) && (
              <p className="mt-3 text-xs text-warn">
                Fontes indisponíveis:{' '}
                {[
                  !o.fontes.prometheus && 'Prometheus (métricas)',
                  !o.fontes.rabbitmq && 'RabbitMQ',
                  !o.fontes.governanca && 'Governança',
                ]
                  .filter(Boolean)
                  .join(', ')}
                . Os campos correspondentes aparecem como “—”.
              </p>
            )}
          </section>

          <section aria-label="Microsserviços" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {o.servicos.map((s) => (
              <Card key={s.id} className="fade-up p-4">
                <div className="text-sm font-medium">{s.nome}</div>
                <div className="mt-2">
                  <EstadoBadge estado={s.estado} />
                </div>
                <div className="tabular mt-2 text-xs text-muted">Healthcheck: {ms(s.latenciaMs)}</div>
              </Card>
            ))}
          </section>

          <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi rotulo="Profissionais" valor={num(o.contadores.profissionais)} />
            <Kpi
              rotulo="Projetos"
              valor={num(o.contadores.projetos)}
              detalhe={`${num(o.contadores.projetosEmAndamento)} em andamento`}
            />
            <Kpi
              rotulo="Requisições / s"
              valor={num(o.desempenho.requisicoesPorSegundo, 2)}
              detalhe="média de 5 min"
            />
            <Kpi
              rotulo="Latência p95"
              valor={ms(o.desempenho.latenciaP95Ms)}
              tom={
                o.desempenho.latenciaP95Ms === null
                  ? undefined
                  : o.desempenho.latenciaP95Ms > 2000
                    ? 'erro'
                    : o.desempenho.latenciaP95Ms > 1000
                      ? 'aviso'
                      : 'ok'
              }
            />
            <Kpi
              rotulo="Taxa de erros 5xx"
              valor={pct(o.desempenho.taxaErros, 2)}
              tom={
                o.desempenho.taxaErros === null
                  ? undefined
                  : o.desempenho.taxaErros > 0.05
                    ? 'erro'
                    : o.desempenho.taxaErros > 0.01
                      ? 'aviso'
                      : 'ok'
              }
            />
            <Kpi
              rotulo="CPU média"
              valor={o.desempenho.cpuPct === null ? '—' : `${num(o.desempenho.cpuPct, 1)}%`}
              detalhe="de 1 núcleo, por serviço"
            />
            <Kpi
              rotulo="Memória (RSS)"
              valor={bytes(o.desempenho.memoriaBytes)}
              detalhe="soma dos serviços"
            />
            <Kpi
              rotulo="Mensagens pendentes"
              valor={num(o.desempenho.filaPendente)}
              detalhe="filas RabbitMQ"
              tom={
                o.desempenho.filaPendente === null
                  ? undefined
                  : o.desempenho.filaPendente > 100
                    ? 'erro'
                    : o.desempenho.filaPendente > 50
                      ? 'aviso'
                      : 'ok'
              }
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de disponibilidade (24 h)</CardTitle>
            </CardHeader>
            <CardBody>
              {o.disponibilidade.length ? (
                <GraficoDisponibilidade dados={o.disponibilidade} />
              ) : (
                <EstadoVazio
                  titulo="Sem histórico de disponibilidade"
                  texto="O Prometheus ainda não acumulou dados ou está indisponível."
                />
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Eventos recentes</CardTitle>
              </CardHeader>
              <CardBody>
                {o.eventos.length === 0 ? (
                  <EstadoVazio titulo="Nenhum evento recente" />
                ) : (
                  <ul className="divide-y divide-line">
                    {o.eventos.map((e, i) => (
                      <li key={`${e.em}-${i}`} className="flex items-start gap-3 py-2.5">
                        <Badge tom={e.tipo === 'governanca' ? 'destaque' : 'info'}>
                          {e.tipo === 'governanca' ? 'Governança' : 'Notificação'}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{e.titulo}</div>
                          <div className="truncate text-xs text-muted">{e.detalhe}</div>
                        </div>
                        <time dateTime={e.em} className="shrink-0 text-xs text-muted">
                          {haQuanto(e.em)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Notificações recentes</CardTitle>
              </CardHeader>
              <CardBody>
                {o.notificacoesRecentes.length === 0 ? (
                  <EstadoVazio
                    titulo="Nenhuma notificação"
                    texto="Notificações aparecem quando projetos são criados ou atualizados."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {o.notificacoesRecentes.map((n) => (
                      <li key={n.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium">{n.assunto}</span>
                          <time dateTime={n.criadoEm} className="shrink-0 text-xs text-muted">
                            {haQuanto(n.criadoEm)}
                          </time>
                        </div>
                        <div className="truncate text-xs text-muted">{n.mensagem}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
