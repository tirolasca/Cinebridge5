import { Link, useParams } from 'react-router';
import { ArrowLeft, Check, X } from 'lucide-react';
import { CabecalhoPagina, CarregandoCards, EstadoErro, EstadoVazio } from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useAtualizarProjeto, useConvite, useProjeto } from '@/hooks/queries';
import { ApiError } from '@/services/api';
import { dataHora, reais } from '@/lib/format';

export default function ProjetoDetalhe() {
  const { id = '' } = useParams();
  const { data: p, isPending, isError, error, refetch } = useProjeto(id);
  const atualizar = useAtualizarProjeto(id);
  const convite = useConvite(id);
  const toast = useToast();

  if (isPending) return <CarregandoCards n={3} />;
  if (isError)
    return error instanceof ApiError && (error.status === 404 || error.status === 400) ? (
      <EstadoVazio
        titulo="Projeto não encontrado"
        acao={
          <Link to="/projetos" className="text-accent underline">
            Voltar aos projetos
          </Link>
        }
      />
    ) : (
      <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />
    );

  const equipe = p.equipe ?? [];
  const custo = equipe.reduce((a, m) => a + (m.custo ?? 0), 0);
  const uso = p.orcamentoTotal > 0 ? Math.min(100, (custo / p.orcamentoTotal) * 100) : 0;
  const estourou = custo > p.orcamentoTotal;
  const finalizado = p.status === 'FINALIZADO';

  const responder = (profissionalId: string, aceito: boolean) =>
    convite.mutate(
      { profissionalId, aceito },
      {
        onSuccess: () => toast.ok(aceito ? 'Convite marcado como aceito.' : 'Convite marcado como recusado.'),
        onError: (e) => toast.erro(e.message),
      },
    );

  return (
    <>
      <Link to="/projetos" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Projetos
      </Link>
      <CabecalhoPagina
        titulo={p.titulo}
        descricao={`Criado em ${dataHora(p.criadoEm)}`}
        acoes={
          <Button
            variante={finalizado ? 'secundario' : 'primario'}
            disabled={atualizar.isPending}
            onClick={() =>
              atualizar.mutate(
                { status: finalizado ? 'EM_ANDAMENTO' : 'FINALIZADO' },
                {
                  onSuccess: () => toast.ok(finalizado ? 'Projeto reaberto.' : 'Projeto finalizado.'),
                  onError: (e) => toast.erro(e.message),
                },
              )
            }
          >
            {finalizado ? 'Reabrir projeto' : 'Finalizar projeto'}
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted">Status</div>
          <div className="mt-2">
            <Badge tom={finalizado ? 'ok' : 'info'}>{finalizado ? 'Finalizado' : 'Em andamento'}</Badge>
          </div>
          <div className="mt-3 text-xs text-muted">Gênero</div>
          <div className="mt-1">
            <Badge>{p.genero}</Badge>
          </div>
        </Card>
        <Card className="p-4 md:col-span-2">
          <div className="flex items-baseline justify-between">
            <div className="text-xs text-muted">Custo da equipe x orçamento</div>
            <div className={`tabular text-sm font-medium ${estourou ? 'text-danger' : ''}`}>
              {reais(custo)} / {reais(p.orcamentoTotal)}
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Uso do orçamento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(uso)}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface2"
          >
            <div
              className={`h-full rounded-full ${estourou ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${uso}%` }}
            />
          </div>
          {estourou && <p className="mt-2 text-xs text-danger">O custo planejado excede o orçamento.</p>}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Equipe e convites</CardTitle>
        </CardHeader>
        <CardBody>
          {equipe.length === 0 ? (
            <EstadoVazio
              titulo="Projeto sem equipe"
              texto="Use Recomendações para formar a equipe automaticamente."
            />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Papel</Th>
                    <Th>Profissional</Th>
                    <Th className="text-right">Custo</Th>
                    <Th className="text-right">Convite</Th>
                  </tr>
                </thead>
                <tbody>
                  {equipe.map((m, i) => (
                    <tr key={`${m.papel}-${i}`}>
                      <Td>
                        <Badge>{m.papel}</Badge>
                      </Td>
                      <Td>{m.nome ?? <span className="text-warn">Sem candidato disponível</span>}</Td>
                      <Td className="tabular text-right">{reais(m.custo)}</Td>
                      <Td className="text-right">
                        {m.profissionalId ? (
                          <span className="inline-flex gap-1.5">
                            <Button
                              tamanho="sm"
                              aria-label={`Marcar convite de ${m.nome} como aceito`}
                              disabled={convite.isPending}
                              onClick={() => responder(m.profissionalId!, true)}
                            >
                              <Check className="size-3.5 text-ok" aria-hidden="true" /> Aceitar
                            </Button>
                            <Button
                              tamanho="sm"
                              aria-label={`Marcar convite de ${m.nome} como recusado`}
                              disabled={convite.isPending}
                              onClick={() => responder(m.profissionalId!, false)}
                            >
                              <X className="size-3.5 text-danger" aria-hidden="true" /> Recusar
                            </Button>
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <p className="mt-3 text-xs text-muted">
            As respostas aos convites alimentam a taxa de aceitação do painel de negócio (Grafana); o serviço
            de projetos não persiste convites individuais.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
