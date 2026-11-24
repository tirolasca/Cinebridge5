import { config, type Estrategia } from './config';

export interface Candidato {
  id: string;
  nome: string;
  papel: string;
  custo: number;
  notaMedia: number;
}

// Normaliza os nomes dos papéis para evitar diferenças entre maiúsculas, minúsculas e acentos.
export function normalizarPapel(papel: string): string {
  const chave = papel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  const equivalencias: Record<string, string> = {
    DIRETOR: 'DIRETOR',
    ROTEIRISTA: 'ROTEIRISTA',
    CINEGRAFISTA: 'CINEGRAFISTA',
    EDITOR: 'EDITOR',
    SONOPLASTA: 'SONOPLASTA',
  };
  return equivalencias[chave] ?? chave;
}

const doPapel = (papel: string, candidatos: Candidato[]) =>
  candidatos.filter((c) => normalizarPapel(c.papel) === normalizarPapel(papel));

/** Estratégia PRINCIPAL: melhor avaliação; em caso de empate, menor custo. */
function escolherPrincipal(papel: string, candidatos: Candidato[]): Candidato | undefined {
  return doPapel(papel, candidatos).sort(
    (a, b) => Number(b.notaMedia) - Number(a.notaMedia) || Number(a.custo) - Number(b.custo),
  )[0];
}

/** Estratégia ORCAMENTO (regras, mais rápida): melhor nota entre quem cabe na cota do papel; senão, o mais barato. */
function escolherPorOrcamento(papel: string, candidatos: Candidato[], cota: number): Candidato | undefined {
  const todos = doPapel(papel, candidatos);
  const dentro = todos.filter((c) => Number(c.custo) <= cota).sort((a, b) => Number(b.notaMedia) - Number(a.notaMedia));
  return dentro[0] ?? todos.sort((a, b) => Number(a.custo) - Number(b.custo))[0];
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function escolherEquipe(
  estrategia: Estrategia,
  papeis: string[],
  candidatos: Candidato[],
  orcamentoTotal: number,
): Promise<(Candidato | undefined)[]> {
  // Gancho de demonstração: simula um recomendador principal lento sem depender de carga real.
  if (estrategia === 'PRINCIPAL' && config.simulacaoLatenciaPrincipalMs > 0) {
    await dormir(config.simulacaoLatenciaPrincipalMs);
  }
  const cota = orcamentoTotal / papeis.length;
  return papeis.map((p) =>
    estrategia === 'PRINCIPAL' ? escolherPrincipal(p, candidatos) : escolherPorOrcamento(p, candidatos, cota),
  );
}
