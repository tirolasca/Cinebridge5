import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  CabecalhoPagina,
  CarregandoCards,
  EstadoBadge,
  EstadoErro,
  EstadoVazio,
  Kpi,
} from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useMensageria } from '@/hooks/queries';
import { num } from '@/lib/format';

export default function Mensageria() {
  const { data, isPending, isError, error, refetch } = useMensageria();
  const [temporarias, setTemporarias] = useState(false);
  const filas = (data?.filas ?? []).filter((f) => temporarias || !f.temporaria);

  return (
    <>
      <CabecalhoPagina
        titulo="Mensageria (RabbitMQ)"
        descricao="Filas, consumidores e taxas, lidos da API de gerenciamento do RabbitMQ. Atualiza a cada 10 s."
      />
      {isPending && <CarregandoCards n={4} />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && (
        <div className="space-y-6">
          <section aria-label="Totais" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi rotulo="Filas duráveis" valor={num(data.totais.filas)} />
            <Kpi
              rotulo="Pendentes"
              valor={num(data.totais.prontas)}
              tom={data.totais.prontas > 100 ? 'erro' : data.totais.prontas > 50 ? 'aviso' : 'ok'}
            />
            <Kpi rotulo="Não confirmadas" valor={num(data.totais.naoConfirmadas)} />
            <Kpi
              rotulo="Consumidores"
              valor={num(data.totais.consumidores)}
              tom={data.totais.consumidores === 0 ? 'erro' : undefined}
            />
            <Kpi rotulo="Publicação" valor={`${num(data.totais.taxaPublicacao, 2)}/s`} />
            <Kpi rotulo="Consumo" valor={`${num(data.totais.taxaConsumo, 2)}/s`} />
            <Kpi
              rotulo="Erros (1 h)"
              valor={num(data.totais.errosUltimaHora)}
              detalhe="processamento de mensagens"
              tom={data.totais.errosUltimaHora ? 'aviso' : undefined}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Filas</CardTitle>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={temporarias}
                  onChange={(e) => setTemporarias(e.target.checked)}
                />
                Mostrar filas temporárias (respostas RPC)
              </label>
            </CardHeader>
            <CardBody>
              {filas.length === 0 ? (
                <EstadoVazio
                  titulo="Nenhuma fila encontrada"
                  texto="As filas são criadas quando os serviços iniciam."
                />
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fila</Th>
                        <Th>Estado</Th>
                        <Th className="text-right">Prontas</Th>
                        <Th className="text-right">Não conf.</Th>
                        <Th className="text-right">Consumidores</Th>
                        <Th className="text-right">Publicadas</Th>
                        <Th className="text-right">Confirmadas</Th>
                        <Th className="text-right">Pub./s</Th>
                        <Th className="text-right">Cons./s</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.nome}>
                          <Td className="font-mono text-xs">
                            {f.nome} {f.temporaria && <Badge className="ml-1">temporária</Badge>}
                          </Td>
                          <Td>
                            <EstadoBadge estado={f.estado === 'running' ? 'saudavel' : 'degradado'} />
                          </Td>
                          <Td className="tabular text-right">{num(f.prontas)}</Td>
                          <Td className="tabular text-right">{num(f.naoConfirmadas)}</Td>
                          <Td
                            className={`tabular text-right ${f.consumidores === 0 && !f.temporaria ? 'text-danger' : ''}`}
                          >
                            {num(f.consumidores)}
                          </Td>
                          <Td className="tabular text-right">{num(f.publicadas)}</Td>
                          <Td className="tabular text-right">{num(f.confirmadas)}</Td>
                          <Td className="tabular text-right">{num(f.taxaPublicacao, 2)}</Td>
                          <Td className="tabular text-right">{num(f.taxaConsumo, 2)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dead-letter queues</CardTitle>
            </CardHeader>
            <CardBody>
              {data.deadLetterConfigurado ? (
                <ul className="space-y-1 text-sm">
                  {data.deadLetter.map((f) => (
                    <li key={f.nome}>
                      <span className="font-mono">{f.nome}</span> — {num(f.prontas)} mensagem(ns)
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex gap-3 rounded-lg border border-line bg-surface2/50 p-4 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                  <p className="text-muted">
                    Nenhuma dead-letter queue está configurada. Hoje, mensagens que falham no processamento
                    são rejeitadas sem reenfileirar (nack) e contabilizadas em “Erros (1 h)”. Configurar DLQs
                    exige alterar as declarações das filas nos serviços — uma mudança de contrato AMQP, fora
                    do escopo deste painel.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
