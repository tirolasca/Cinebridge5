import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Star } from 'lucide-react';
import { CabecalhoPagina, CarregandoTabela, EstadoErro, EstadoVazio, Paginacao } from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Campo, Input, Select } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useCriarProfissional, useProfissionais } from '@/hooks/queries';
import { PAPEIS } from '@/lib/constantes';
import { reais } from '@/lib/format';
import type { Profissional } from '@/types/api';

const TAM = 8;

export default function Profissionais() {
  const { data, isPending, isError, error, refetch } = useProfissionais();
  const [busca, setBusca] = useState('');
  const [papel, setPapel] = useState('');
  const [pagina, setPagina] = useState(1);
  const [detalhe, setDetalhe] = useState<Profissional | null>(null);
  const [novo, setNovo] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(
      (p) =>
        (!papel || p.papel.toUpperCase() === papel) &&
        (!q || p.nome.toLowerCase().includes(q) || p.competencias.some((c) => c.toLowerCase().includes(q))),
    );
  }, [data, busca, papel]);
  const visiveis = filtrados.slice((pagina - 1) * TAM, pagina * TAM);

  return (
    <>
      <CabecalhoPagina
        titulo="Profissionais"
        descricao="Banco de talentos usado nas recomendações. O serviço permite listar e cadastrar; edição e exclusão não existem no contrato atual."
        acoes={
          <Button variante="primario" onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden="true" /> Novo profissional
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar por nome ou competência"
            placeholder="Buscar por nome ou competência…"
            className="pl-9"
            value={busca}
            onChange={(e) => (setBusca(e.target.value), setPagina(1))}
          />
        </div>
        <Select
          aria-label="Filtrar por papel"
          className="w-48"
          value={papel}
          onChange={(e) => (setPapel(e.target.value), setPagina(1))}
        >
          <option value="">Todos os papéis</option>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      {isPending && <CarregandoTabela />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && filtrados.length === 0 && (
        <EstadoVazio
          titulo={data.length === 0 ? 'Nenhum profissional cadastrado' : 'Nenhum resultado para os filtros'}
          texto={
            data.length === 0
              ? 'Cadastre o primeiro profissional para alimentar as recomendações.'
              : 'Ajuste a busca ou o papel selecionado.'
          }
        />
      )}
      {filtrados.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Papel</Th>
                  <Th className="text-right">Custo</Th>
                  <Th className="text-right">Nota</Th>
                  <Th>Competências</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} className="hover:bg-surface2/50">
                    <Td>
                      <button
                        className="font-medium text-accent underline-offset-2 hover:underline"
                        onClick={() => setDetalhe(p)}
                      >
                        {p.nome}
                      </button>
                    </Td>
                    <Td>
                      <Badge>{p.papel}</Badge>
                    </Td>
                    <Td className="tabular text-right">{reais(p.custo)}</Td>
                    <Td className="tabular text-right">
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5 text-accent" aria-hidden="true" />
                        {p.notaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                      </span>
                    </Td>
                    <Td className="max-w-64 truncate text-muted">{p.competencias.join(', ') || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Paginacao pagina={pagina} total={filtrados.length} tamanho={TAM} aoMudar={setPagina} />
        </>
      )}

      <Dialog
        aberto={!!detalhe}
        aoFechar={() => setDetalhe(null)}
        titulo={detalhe?.nome ?? ''}
        descricao="Detalhes do profissional"
      >
        {detalhe && (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Papel</dt>
              <dd>{detalhe.papel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Custo</dt>
              <dd className="tabular">{reais(detalhe.custo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Nota média</dt>
              <dd className="tabular">{detalhe.notaMedia}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Identificador</dt>
              <dd className="truncate font-mono text-xs">{detalhe.id}</dd>
            </div>
            <div className="col-span-2">
              <dt className="mb-1 text-xs text-muted">Competências</dt>
              <dd className="flex flex-wrap gap-1.5">
                {detalhe.competencias.length
                  ? detalhe.competencias.map((c) => <Badge key={c}>{c}</Badge>)
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </Dialog>
      <NovoProfissional aberto={novo} aoFechar={() => setNovo(false)} />
    </>
  );
}

export function NovoProfissional({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criar = useCriarProfissional();
  const toast = useToast();
  const [f, setF] = useState({ nome: '', papel: 'DIRETOR', custo: '', nota: '0', competencias: '' });
  const [erros, setErros] = useState<Record<string, string>>({});

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const custo = Number(f.custo.replace(',', '.'));
    const nota = Number(f.nota.replace(',', '.'));
    if (!f.nome.trim()) er.nome = 'Informe o nome.';
    if (!f.custo || !Number.isFinite(custo) || custo <= 0) er.custo = 'Informe um custo maior que zero.';
    if (!Number.isFinite(nota) || nota < 0 || nota > 5) er.nota = 'A nota deve estar entre 0 e 5.';
    setErros(er);
    if (Object.keys(er).length) return;
    criar.mutate(
      {
        nome: f.nome.trim(),
        papel: f.papel,
        custo,
        notaMedia: nota,
        competencias: f.competencias
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          toast.ok('Profissional cadastrado.');
          setF({ nome: '', papel: 'DIRETOR', custo: '', nota: '0', competencias: '' });
          aoFechar();
        },
        onError: (err) => toast.erro(err.message),
      },
    );
  };

  return (
    <Dialog
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo profissional"
      descricao="Cadastro enviado ao serviço de profissionais."
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo rotulo="Nome" erro={erros.nome}>
          {(p) => <Input {...p} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />}
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo rotulo="Papel">
            {(p) => (
              <Select {...p} value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}>
                {PAPEIS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            )}
          </Campo>
          <Campo rotulo="Custo (R$)" erro={erros.custo}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={f.custo}
                onChange={(e) => setF({ ...f, custo: e.target.value })}
              />
            )}
          </Campo>
        </div>
        <Campo rotulo="Nota média (0–5)" erro={erros.nota}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={f.nota}
              onChange={(e) => setF({ ...f, nota: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Competências" dica="Separe por vírgulas.">
          {(p) => (
            <Input
              {...p}
              value={f.competencias}
              onChange={(e) => setF({ ...f, competencias: e.target.value })}
            />
          )}
        </Campo>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variante="primario" disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Cadastrar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
