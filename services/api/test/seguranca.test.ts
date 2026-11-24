import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { exigirAdmin, registrarTratamentoDeErros, validarAmbiente } from '../src/seguranca';
import { instrumentarFastify } from '../src/obs';

const limpar = () => {
  delete process.env.AMBIENTE;
  delete process.env.ADMIN_TOKEN;
  delete process.env.HABILITAR_SIMULACAO;
};
beforeEach(limpar);

async function app() {
  const a = Fastify();
  instrumentarFastify(a);
  registrarTratamentoDeErros(a);
  a.get('/admin', { preHandler: exigirAdmin }, async () => ({ ok: true }));
  a.get('/boom', async () => {
    throw new Error('senha=segredo host=db-interno');
  });
  a.post('/json', async (req) => req.body);
  return a;
}

test('com ADMIN_TOKEN: rejeita ausente/errado e aceita o correto', async () => {
  process.env.ADMIN_TOKEN = 'x'.repeat(32);
  const a = await app();
  assert.equal((await a.inject({ url: '/admin' })).statusCode, 401);
  assert.equal((await a.inject({ url: '/admin', headers: { authorization: 'Bearer errado' } })).statusCode, 401);
  assert.equal((await a.inject({ url: '/admin', headers: { authorization: `Bearer ${'x'.repeat(32)}` } })).statusCode, 200);
});

test('sem ADMIN_TOKEN: liberado em ambiente local, bloqueado (503) em produção', async () => {
  const a = await app();
  assert.equal((await a.inject({ url: '/admin' })).statusCode, 200);
  process.env.AMBIENTE = 'producao';
  assert.equal((await a.inject({ url: '/admin' })).statusCode, 503);
});

test('erro interno não vaza detalhes; JSON inválido vira 400', async () => {
  const a = await app();
  const r = await a.inject({ url: '/boom' });
  assert.equal(r.statusCode, 500);
  assert.deepEqual(r.json(), { erro: 'erro interno' });
  const j = await a.inject({ method: 'POST', url: '/json', headers: { 'content-type': 'application/json' }, payload: '{ quebrado' });
  assert.equal(j.statusCode, 400);
});

test('validarAmbiente: produção exige token forte e proíbe simulação', () => {
  assert.doesNotThrow(() => validarAmbiente(['ADMIN_TOKEN'])); // local: não valida
  process.env.AMBIENTE = 'producao';
  assert.throws(() => validarAmbiente(['ADMIN_TOKEN']), /ADMIN_TOKEN não definida/);
  process.env.ADMIN_TOKEN = 'curto';
  assert.throws(() => validarAmbiente(['ADMIN_TOKEN']), /24 caracteres/);
  process.env.ADMIN_TOKEN = 'y'.repeat(30);
  process.env.HABILITAR_SIMULACAO = 'true';
  assert.throws(() => validarAmbiente(['ADMIN_TOKEN']), /HABILITAR_SIMULACAO/);
  delete process.env.HABILITAR_SIMULACAO;
  assert.doesNotThrow(() => validarAmbiente(['ADMIN_TOKEN']));
});

test('/metrics expõe métricas e a resposta traz x-correlation-id', async () => {
  const a = await app();
  a.get('/ping', async () => 'pong');
  const r = await a.inject({ url: '/ping' });
  assert.match(String(r.headers['x-correlation-id']), /^[0-9a-f]{32}$/);
  const m = await a.inject({ url: '/metrics' });
  assert.equal(m.statusCode, 200);
  assert.match(m.body, /cinebridge_http_requests_total\{[^}]*rota="\/ping"[^}]*\} 1/);
  assert.match(m.body, /cinebridge_nodejs_heap_size_used_bytes/);
});
