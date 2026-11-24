import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherEquipe, normalizarPapel, type Candidato } from '../src/estrategias';
import { config } from '../src/config';

const c = (id: string, papel: string, custo: number, notaMedia: number): Candidato => ({ id, nome: id, papel, custo, notaMedia });
const base = [c('a', 'Diretor', 9000, 4.5), c('b', 'diretor', 3000, 4.0), c('c', 'DIRETOR', 3000, 4.5), c('d', 'Editor', 5000, 3.0)];

test('normalizarPapel ignora caixa, acentos e espaços', () => {
  assert.equal(normalizarPapel('  Diretór '), 'DIRETOR');
  assert.equal(normalizarPapel('cinegrafista'), 'CINEGRAFISTA');
});

test('PRINCIPAL: melhor nota; empate resolvido pelo menor custo', async () => {
  const [d] = await escolherEquipe('PRINCIPAL', ['DIRETOR'], base, 30000);
  assert.equal(d?.id, 'c');
});

test('ORCAMENTO: melhor nota dentro da cota do papel; sem ninguém na cota, o mais barato', async () => {
  const [d] = await escolherEquipe('ORCAMENTO', ['DIRETOR'], base, 6000); // cota 6000
  assert.equal(d?.id, 'c');
  const [e] = await escolherEquipe('ORCAMENTO', ['EDITOR'], base, 1000); // cota 1000 < 5000
  assert.equal(e?.id, 'd');
});

test('papel sem candidatos devolve undefined', async () => {
  const [x] = await escolherEquipe('PRINCIPAL', ['SONOPLASTA'], base, 1000);
  assert.equal(x, undefined);
});

test('simulação de latência só atinge a estratégia PRINCIPAL', async () => {
  config.simulacaoLatenciaPrincipalMs = 120;
  const t0 = Date.now();
  await escolherEquipe('ORCAMENTO', ['DIRETOR'], base, 6000);
  const rapido = Date.now() - t0;
  const t1 = Date.now();
  await escolherEquipe('PRINCIPAL', ['DIRETOR'], base, 6000);
  const lento = Date.now() - t1;
  config.simulacaoLatenciaPrincipalMs = 0;
  assert.ok(rapido < 100 && lento >= 100, `rapido=${rapido} lento=${lento}`);
});
