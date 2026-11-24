import { CabecalhoPagina, CarregandoCards, EstadoBadge, EstadoErro } from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { useServicos } from '@/hooks/queries';
import { dataHora, haQuanto, ms, num } from '@/lib/format';

export default function Servicos() {
  const { data, isPending, isError, error, refetch } = useServicos();
  return (
    <>
      <CabecalhoPagina
        titulo="Microsserviços"
        descricao="Estado, latência do healthcheck, erros recentes e dependências de cada serviço. Somente leitura: reinício de containers não é exposto por segurança."
      />
      {isPending && <CarregandoCards n={5} />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.servicos.map((s) => (
            <Card key={s.id} className="fade-up">
              <CardHeader>
                <div>
                  <CardTitle className="text-base">{s.nome}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted">{s.papel}</p>
                </div>
                <EstadoBadge estado={s.estado} />
              </CardHeader>
              <CardBody className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Identificador</dt>
                    <dd className="truncate font-mono text-xs">{s.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Healthcheck</dt>
                    <dd className="tabular">{ms(s.latenciaMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Latência p95 (5 min)</dt>
                    <dd className="tabular">{ms(s.latenciaP95Ms)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Erros 5xx (1 h)</dt>
                    <dd className={`tabular ${s.erros1h ? 'text-danger' : ''}`}>{num(s.erros1h)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted">Última verificação</dt>
                    <dd>
                      <time dateTime={s.verificadoEm} title={dataHora(s.verificadoEm)}>
                        {haQuanto(s.verificadoEm)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <div>
                  <div className="mb-1 text-xs text-muted">Dependências</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.dependencias.map((d) => (
                      <Badge key={d}>{d}</Badge>
                    ))}
                  </div>
                </div>
                {s.detalhe && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted hover:text-fg">
                      Resposta do healthcheck
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-bg-elev p-3 font-mono">
                      {JSON.stringify(s.detalhe, null, 2)}
                    </pre>
                  </details>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
