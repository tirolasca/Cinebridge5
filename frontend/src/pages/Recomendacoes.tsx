import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Loader2, Sparkles } from 'lucide-react';
import { CabecalhoPagina, CarregandoTabela, EstadoErro, EstadoVazio } from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Campo, Input, Select } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useRecomendacoes, useRecomendar } from '@/hooks/queries';
import { dataHora, reais } from '@/lib/format';
import { GENEROS, PAPEIS } from '@/lib/constantes';
import type { ResultadoRecomendacao } from '@/types/api';

export default function Recomendacoes() {
  const recomendar = useRecomendar();
  const historico = useRecomendacoes();
  const toast = useToast();
  const [titulo, setTitulo] = useState('');
  const [orcamento, setOrcamento] = useState('');
  const [genero, setGenero] = useState('NAO_INFORMADO');
  const [papeis, setPapeis] = useState<string[]>(['DIRETOR', 'EDITOR']);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoRecomendacao | null>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const orc = Number(orcamento.replace(',', '.'));
    if (!titulo.trim()) er.titulo = 'Informe o título do projeto.';
    if (!orcamento || !Number.isFinite(orc) || orc <= 0)
      er.orcamento = 'Informe um orçamento maior que zero.';
    if (papeis.length === 0) er.papeis = 'Selecione ao menos um papel.';
    setErros(er);
    if (Object.keys(er).length) return;
    recomendar.mutate(
      {
        titulo: titulo.trim(),
        orcamentoTotal: orc,
        genero,
        papeisRequeridos: papeis.map((papel) => ({ papel })),
      },
      {
        onSuccess: (r) => (setResultado(r), toast.ok('Equipe recomendada.')),
        onError: (err) => toast.erro(err.message),
      },
    );
  };

  const alternar = (p: string) => setPapeis((x) => (x.includes(p) ? x.filter((i) => i !== p) : [...x, p]));

  return (
    <>
      <CabecalhoPagina
        titulo="Recomendações de equipe"
        descricao="Aciona o serviço de recomendação (API → RabbitMQ → profissionais/projetos). A estratégia ativa é definida pela governança."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Novo pedido</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={enviar} noValidate className="space-y-4">
              <Campo rotulo="Título do projeto" erro={erros.titulo}>
                {(p) => <Input {...p} value={titulo} onChange={(e) => setTitulo(e.target.value)} />}
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo rotulo="Orçamento (R$)" erro={erros.orcamento}>
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="decimal"
                      value={orcamento}
                      onChange={(e) => setOrcamento(e.target.value)}
                    />
                  )}
                </Campo>
                <Campo rotulo="Gênero">
                  {(p) => (
                    <Select {...p} value={genero} onChange={(e) => setGenero(e.target.value)}>
                      {GENEROS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </Select>
                  )}
                </Campo>
              </div>
              <fieldset aria-describedby={erros.papeis ? 'erro-papeis' : undefined}>
                <legend className="mb-2 text-xs font-medium text-muted">Papéis necessários</legend>
                <div className="flex flex-wrap gap-2">
                  {PAPEIS.map((p) => (
                    <label
                      key={p}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${papeis.includes(p) ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={papeis.includes(p)}
                        onChange={() => alternar(p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
                {erros.papeis && (
                  <p id="erro-papeis" role="alert" className="mt-1.5 text-xs text-danger">
                    {erros.papeis}
                  </p>
                )}
              </fieldset>
              <Button type="submit" variante="primario" className="w-full" disabled={recomendar.isPending}>
                {recomendar.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-4" aria-hidden="true" />
                )}
                {recomendar.isPending ? 'Formando equipe…' : 'Recomendar equipe'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
              {resultado && <Badge tom="destaque">Estratégia {resultado.estrategia}</Badge>}
            </CardHeader>
            <CardBody>
              {!resultado ? (
                <EstadoVazio
                  titulo="Nenhuma recomendação nesta sessão"
                  texto="Preencha o pedido ao lado para ver a equipe sugerida."
                />
              ) : (
                <div className="space-y-3">
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Papel</Th>
                          <Th>Profissional</Th>
                          <Th className="text-right">Custo</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.itens.map((m, i) => (
                          <tr key={`${m.papel}-${i}`}>
                            <Td>
                              <Badge>{m.papel}</Badge>
                            </Td>
                            <Td>{m.nome ?? <span className="text-warn">Sem candidato</span>}</Td>
                            <Td className="tabular text-right">{reais(m.custo)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableWrap>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="tabular">
                      Custo planejado: <strong>{reais(resultado.custoPlanejado)}</strong>
                    </span>
                    <Badge tom={resultado.dentroDoOrcamento ? 'ok' : 'erro'}>
                      {resultado.dentroDoOrcamento ? 'Dentro do orçamento' : 'Acima do orçamento'}
                    </Badge>
                    {resultado.parcial && <Badge tom="aviso">Equipe parcial</Badge>}
                  </div>
                  {resultado.aviso && <p className="text-xs text-warn">{resultado.aviso}</p>}
                  {resultado.projetoId && (
                    <Link
                      to={`/projetos/${resultado.projetoId}`}
                      className="text-sm text-accent underline-offset-2 hover:underline"
                    >
                      Abrir projeto criado →
                    </Link>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico (últimas 20)</CardTitle>
            </CardHeader>
            <CardBody>
              {historico.isPending && <CarregandoTabela linhas={3} />}
              {historico.isError && (
                <EstadoErro mensagem={historico.error.message} aoTentar={() => void historico.refetch()} />
              )}
              {historico.data && historico.data.length === 0 && (
                <EstadoVazio titulo="Sem recomendações registradas" />
              )}
              {historico.data && historico.data.length > 0 && (
                <ul className="divide-y divide-line">
                  {historico.data.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      {h.projetoId ? (
                        <Link
                          to={`/projetos/${h.projetoId}`}
                          className="truncate font-medium text-accent hover:underline"
                        >
                          {h.titulo}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{h.titulo}</span>
                      )}
                      <time dateTime={h.criadoEm} className="shrink-0 text-xs text-muted">
                        {dataHora(h.criadoEm)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
