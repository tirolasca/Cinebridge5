import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarConfig, cacheGravar, cacheObter, config } from '../src/config';

test('cache respeita TTL e tamanho máximo (descarta o mais antigo)', async () => {
  aplicarConfig({ tipo: 'CACHE', ttlSeg: 60, tamanhoMax: 2 });
  cacheGravar('a', 1);
  cacheGravar('b', 2);
  cacheGravar('c', 3);
  assert.equal(cacheObter('a'), undefined);
  assert.equal(cacheObter('c'), 3);
  aplicarConfig({ tipo: 'CACHE', ttlSeg: 1, tamanhoMax: 10 });
  cacheGravar('x', 9);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(cacheObter('x'), undefined);
});

test('aplicarConfig valida e limita valores; ignora mensagens inválidas', () => {
  aplicarConfig({ tipo: 'ESTRATEGIA', valor: 'ORCAMENTO' });
  assert.equal(config.estrategia, 'ORCAMENTO');
  aplicarConfig({ tipo: 'ESTRATEGIA', valor: 'QUALQUER' });
  assert.equal(config.estrategia, 'ORCAMENTO');
  aplicarConfig({ tipo: 'CACHE', ttlSeg: 999999, tamanhoMax: -5 });
  assert.equal(config.cacheTtlSeg, 3600);
  assert.equal(config.cacheTamanhoMax, 1);
  aplicarConfig({ tipo: 'CACHE', ttlSeg: 'abc' });
  assert.equal(config.cacheTtlSeg, 3600);
  aplicarConfig({ tipo: 'ESTRATEGIA', valor: 'PRINCIPAL' });
});

test('cache desligado não armazena', () => {
  aplicarConfig({ tipo: 'CACHE', ativo: false });
  cacheGravar('k', 1);
  assert.equal(cacheObter('k'), undefined);
  aplicarConfig({ tipo: 'CACHE', ativo: true });
});
