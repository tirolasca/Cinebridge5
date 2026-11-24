import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Plus, Search, Sparkles } from 'lucide-react';
import { CabecalhoPagina, CarregandoTabela, EstadoErro, EstadoVazio, Paginacao } from '@/components/comuns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { botao } from '@/components/ui/button-variants';
import { Dialog } from '@/components/ui/dialog';
import { Campo, Input, Select } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useCriarProjeto, useProjetos } from '@/hooks/queries';
import { GENEROS } from '@/lib/constantes';
import { dataHora, reais } from '@/lib/format';

const TAM = 8;

export default function Projetos() {
  const { data, isPending, isError, error, refetch } = useProjetos();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [genero, setGenero] = useState('');
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(
      (p) =>
        (!status || p.status === status) &&
        (!genero || p.genero === genero) &&
        (!q || p.titulo.toLowerCase().includes(q)),
    );
  }, [data, busca, status, genero]);
  const visiveis = filtrados.slice((pagina - 1) * TAM, pagina * TAM);
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => (set(v), setPagina(1));

  return (
    <>
      <CabecalhoPagina
        titulo="Projetos"
        descricao="Projetos registrados, status e equipes formadas. Regras de negócio permanecem nos serviços; este painel apenas as aciona."
        acoes={
          <>
            <Link to="/recomendacoes" className={botao()}>
              <Sparkles className="size-4" aria-hidden="true" /> Nova recomendação
            </Link>
            <Button variante="primario" onClick={() => setNovo(true)}>
              <Plus className="size-4" aria-hidden="true" /> Novo projeto
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar projeto pelo título"
            placeholder="Buscar pelo título…"
            className="pl-9"
            value={busca}
            onChange={(e) => reset(setBusca)(e.target.value)}
          />
        </div>
        <Select
          aria-label="Filtrar por status"
          className="w-44"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="FINALIZADO">Finalizado</option>
        </Select>
        <Select
          aria-label="Filtrar por gênero"
          className="w-48"
          value={genero}
          onChange={(e) => reset(setGenero)(e.target.value)}
        >
          <option value="">Todos os gêneros</option>
          {GENEROS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
      </div>

      {isPending && <CarregandoTabela />}
      {isError && <EstadoErro mensagem={error.message} aoTentar={() => void refetch()} />}
      {data && filtrados.length === 0 && (
        <EstadoVazio
          titulo={data.length === 0 ? 'Nenhum projeto ainda' : 'Nenhum resultado para os filtros'}
          texto={
            data.length === 0 ? 'Gere uma recomendação de equipe para criar o primeiro projeto.' : undefined
          }
        />
      )}
      {filtrados.length > 0 && (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Título</Th>
                  <Th>Gênero</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Orçamento</Th>
                  <Th className="text-right">Equipe</Th>
                  <Th>Criado em</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} className="hover:bg-surface2/50">
                    <Td>
                      <Link
                        to={`/projetos/${p.id}`}
                        className="font-medium text-accent underline-offset-2 hover:underline"
                      >
                        {p.titulo}
                      </Link>
                    </Td>
                    <Td>
                      <Badge>{p.genero}</Badge>
                    </Td>
                    <Td>
                      <Badge tom={p.status === 'FINALIZADO' ? 'ok' : 'info'}>
                        {p.status === 'FINALIZADO' ? 'Finalizado' : 'Em andamento'}
                      </Badge>
                    </Td>
                    <Td className="tabular text-right">{reais(p.orcamentoTotal)}</Td>
                    <Td className="tabular text-right">{p.equipe?.length ?? 0}</Td>
                    <Td className="text-muted">{dataHora(p.criadoEm)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Paginacao pagina={pagina} total={filtrados.length} tamanho={TAM} aoMudar={setPagina} />
        </>
      )}
      <NovoProjeto aberto={novo} aoFechar={() => setNovo(false)} />
    </>
  );
}

function NovoProjeto({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const criar = useCriarProjeto();
  const toast = useToast();
  const [f, setF] = useState({ titulo: '', orcamento: '', genero: 'NAO_INFORMADO' });
  const [erros, setErros] = useState<Record<string, string>>({});

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const orc = Number(f.orcamento.replace(',', '.'));
    if (!f.titulo.trim()) er.titulo = 'Informe o título.';
    if (!f.orcamento || !Number.isFinite(orc) || orc <= 0)
      er.orcamento = 'Informe um orçamento maior que zero.';
    setErros(er);
    if (Object.keys(er).length) return;
    criar.mutate(
      { titulo: f.titulo.trim(), orcamentoTotal: orc, genero: f.genero },
      {
        onSuccess: () => {
          toast.ok('Projeto criado.');
          setF({ titulo: '', orcamento: '', genero: 'NAO_INFORMADO' });
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
      titulo="Novo projeto"
      descricao="Cria o projeto sem equipe. Para formar a equipe automaticamente, use Recomendações."
    >
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo rotulo="Título" erro={erros.titulo}>
          {(p) => <Input {...p} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />}
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo rotulo="Orçamento (R$)" erro={erros.orcamento}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={f.orcamento}
                onChange={(e) => setF({ ...f, orcamento: e.target.value })}
              />
            )}
          </Campo>
          <Campo rotulo="Gênero">
            {(p) => (
              <Select {...p} value={f.genero} onChange={(e) => setF({ ...f, genero: e.target.value })}>
                {GENEROS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            )}
          </Campo>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variante="primario" disabled={criar.isPending}>
            {criar.isPending ? 'Criando…' : 'Criar projeto'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
