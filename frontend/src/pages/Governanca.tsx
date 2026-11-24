import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  CabecalhoPagina,
  CarregandoCards,
  EstadoBadge,
  EstadoErro,
  EstadoVazio,
  Kpi,
} from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useGovernanca, useMetricas, useTrocarEstrategia } from '@/hooks/queries';
import { bytes, dataHora, haQuanto, num } from '@/lib/format';
import type { RegistroAuditoria } from '@/types/api';

const resumo = (r: RegistroAuditoria): string =>
  Object.entries(r)
    .filter(([k]) => !['timestamp', 'acao'].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');

export default function Governanca() {
  const { data, isPending, isError, error, refetch } = useGovernanca();
  const metricas = useMetricas();
  const trocar = useTrocarEstrategia();
  const toast = useToast();
  const [confirmar, setConfirmar] = useState<'PRINCIPAL' | 'ORCAMENTO' | null>(null);
  const [filtro, setFiltro] = useState('');

  const acoes = useMemo(
    () => [...new Set((data?.auditoria ?? []).map((a) => String(a.acao ?? '')))].filter(Boolean).sort(),
    [data],
  );
  const auditoria = (data?.auditoria ?? []).filter((a) => !filtro || a.acao === filtro);
  const escala = (data?.auditoria ?? []).filter((a) => String(a.acao).startsWith('ESCALA_'));

  if (isPending) return <CarregandoCards n={4} />;
  if (isError) return <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />;

  const e = data.estado.estado;
  const alvo = e.estrategia === 'PRINCIPAL' ? 'ORCAMENTO' : 'PRINCIPAL';

  return (
    <>
      <CabecalhoPagina
        titulo="Governança"
        descricao="Regras autônomas que ajustam estratégia, cache e recursos com base nas métricas. Toda ação — automática ou manual — fica na trilha de auditoria."
        acoes={
          <Button variante="perigo" onClick={() => setConfirmar(alvo)}>
            <ShieldAlert className="size-4" aria-hidden="true" /> Trocar para{' '}
            {alvo === 'ORCAMENTO' ? 'estratégia por orçamento' : 'estratégia principal'}
          </Button>
        }
      />
      <div className="space-y-6">
        <section aria-label="Estado atual" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            rotulo="Estratégia ativa"
            valor={e.estrategia}
            detalhe={`desde ${haQuanto(new Date(e.estrategiaDesde * 1000).toISOString())}`}
            tom={e.estrategia === 'ORCAMENTO' ? 'aviso' : 'ok'}
          />
          <Kpi
            rotulo="Cache: expiração"
            valor={`${num(e.cacheTtlSeg)} s`}
            detalhe={`até ${num(e.cacheTamanhoMax)} entradas`}
          />
          <Kpi rotulo="Amostragem de traces" valor={`${num(e.amostragem * 100)}%`} />
          <Card className="p-4">
            <div className="text-xs font-medium text-muted">Escalonamento por Docker</div>
            <div className="mt-2">
              <EstadoBadge estado={data.estado.dockerHabilitado ? 'saudavel' : 'degradado'} />
            </div>
            <div className="mt-1.5 text-xs text-muted">
              {data.estado.dockerHabilitado
                ? 'Réplicas criadas e removidas automaticamente.'
                : 'Desativado: sem acesso ao Docker neste ambiente.'}
            </div>
          </Card>
        </section>

        {data.configApi && (
          <Card>
            <CardHeader>
              <CardTitle>Configuração dinâmica em vigor na API</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-wrap gap-2 text-sm">
              <Badge tom="destaque">estratégia {data.configApi.estrategia}</Badge>
              <Badge>cache {data.configApi.cacheAtivo ? 'ligado' : 'desligado'}</Badge>
              <Badge>TTL {data.configApi.cacheTtlSeg} s</Badge>
              <Badge>máx. {data.configApi.cacheTamanhoMax} entradas</Badge>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Eventos de escalabilidade</CardTitle>
          </CardHeader>
          <CardBody>
            {escala.length === 0 ? (
              <EstadoVazio
                titulo="Nenhum evento de escalabilidade"
                texto={
                  data.estado.dockerHabilitado
                    ? 'Réplicas só são criadas quando a CPU média fica acima do limite pelo tempo configurado.'
                    : 'O escalonamento horizontal está desativado neste ambiente.'
                }
              />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {escala.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <Badge tom={a.acao === 'ESCALA_PARA_CIMA' ? 'aviso' : 'info'}>
                        {a.acao === 'ESCALA_PARA_CIMA' ? 'Escala para cima' : 'Escala para baixo'}
                      </Badge>{' '}
                      <span className="ml-2 text-muted">{resumo(a)}</span>
                    </span>
                    <time dateTime={a.timestamp} className="shrink-0 text-xs text-muted">
                      {haQuanto(a.timestamp)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recursos por serviço</CardTitle>
          </CardHeader>
          <CardBody>
            {metricas.data?.prometheusDisponivel ? (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Serviço</Th>
                      <Th className="text-right">CPU</Th>
                      <Th className="text-right">Heap</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricas.data.servicos.map((s) => (
                      <tr key={s.id}>
                        <Td>{s.nome}</Td>
                        <Td className="tabular text-right">
                          {s.cpuPct === null ? '—' : `${num(s.cpuPct, 1)}%`}
                        </Td>
                        <Td className="tabular text-right">{bytes(s.heapBytes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <EstadoVazio titulo="Métricas de recursos indisponíveis" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trilha de auditoria</CardTitle>
            <Select
              aria-label="Filtrar por ação"
              className="w-56"
              value={filtro}
              onChange={(ev) => setFiltro(ev.target.value)}
            >
              <option value="">Todas as ações</option>
              {acoes.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </CardHeader>
          <CardBody>
            {auditoria.length === 0 ? (
              <EstadoVazio
                titulo="Nenhuma ação registrada"
                texto="Ações automáticas e manuais aparecem aqui assim que ocorrerem."
              />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Quando</Th>
                      <Th>Ação</Th>
                      <Th>Detalhes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditoria.map((a, i) => (
                      <tr key={i}>
                        <Td className="whitespace-nowrap text-muted">{dataHora(a.timestamp)}</Td>
                        <Td>
                          <Badge tom={String(a.acao).includes('MANUAL') ? 'destaque' : 'neutro'}>
                            {a.acao}
                          </Badge>
                        </Td>
                        <Td className="max-w-xl break-words text-xs text-muted">{resumo(a)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog
        aberto={confirmar !== null}
        aoFechar={() => setConfirmar(null)}
        titulo="Confirmar intervenção manual"
        descricao="Esta ação altera o comportamento do sistema imediatamente e será registrada na auditoria com o seu usuário."
      >
        <p className="text-sm">
          Trocar a estratégia de recomendação de <strong>{e.estrategia}</strong> para{' '}
          <strong>{confirmar}</strong>? As regras automáticas continuam ativas e podem alterá-la novamente.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={trocar.isPending}
            onClick={() =>
              confirmar &&
              trocar.mutate(confirmar, {
                onSuccess: () => (toast.ok('Estratégia alterada.'), setConfirmar(null)),
                onError: (err) => (toast.erro(err.message), setConfirmar(null)),
              })
            }
          >
            {trocar.isPending ? 'Aplicando…' : 'Confirmar'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
