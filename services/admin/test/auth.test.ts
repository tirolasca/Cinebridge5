import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { ambiente, SENHA, USUARIO, type Ambiente } from './helpers';
import { hashSenha, verificarSenha } from '../src/senha';
import { Sessoes } from '../src/sessoes';
import { carregarConfig } from '../src/config';

let amb: Ambiente;
before(async () => {
  amb = await ambiente({ COOKIE_SEGURO: 'true', LIMITE_LOGIN_POR_MINUTO: '100' });
});
after(() => amb.fechar());
const P = '/painel/api';

test('rotas protegidas respondem 401 sem sessão', async () => {
  for (const url of ['/overview', '/servicos', '/profissionais', '/projetos', '/mensageria', '/governanca', '/observabilidade/metricas', '/auth/me', '/stream']) {
    const r = await amb.criado.app.inject({ url: P + url });
    assert.equal(r.statusCode, 401, url);
  }
});

test('login inválido: 401 genérico, sem cookie; campos ausentes: 400', async () => {
  const errada = await amb.criado.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: { usuario: USUARIO, senha: 'errada' } });
  assert.equal(errada.statusCode, 401);
  assert.equal(errada.headers['set-cookie'], undefined);
  const outroUsuario = await amb.criado.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: { usuario: 'x', senha: SENHA } });
  assert.deepEqual(outroUsuario.json(), errada.json()); // não revela se o usuário existe
  const vazio = await amb.criado.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: {} });
  assert.equal(vazio.statusCode, 400);
});

test('login válido: cookie HttpOnly, Secure, SameSite=Strict e Path restrito; /auth/me funciona', async () => {
  const r = await amb.criado.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: { usuario: USUARIO, senha: SENHA } });
  assert.equal(r.statusCode, 200);
  const c = String(([] as string[]).concat(r.headers['set-cookie'] ?? [])[0]);
  assert.match(c, /^cb_sid=/);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/painel']) assert.ok(c.includes(attr), `${attr} em ${c}`);
  const me = await amb.criado.app.inject({ url: `${P}/auth/me`, headers: { cookie: c.split(';')[0]! } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().usuario, USUARIO);
});

test('CSRF: mutação sem token → 403; com token → ok; origem cruzada → 403', async () => {
  const { cookie, csrf } = await amb.login();
  const sem = await amb.criado.app.inject({ method: 'POST', url: `${P}/profissionais`, headers: { cookie }, payload: { nome: 'A' } });
  assert.equal(sem.statusCode, 403);
  const com = await amb.criado.app.inject({ method: 'POST', url: `${P}/profissionais`, headers: { cookie, 'x-csrf-token': csrf }, payload: { nome: 'A', papel: 'DIRETOR', custo: 1 } });
  assert.equal(com.statusCode, 201);
  const cruzada = await amb.criado.app.inject({ method: 'POST', url: `${P}/profissionais`, headers: { cookie, 'x-csrf-token': csrf, origin: 'https://evil.example', host: 'localhost' }, payload: {} });
  assert.equal(cruzada.statusCode, 403);
  const fetchSite = await amb.criado.app.inject({ method: 'POST', url: `${P}/profissionais`, headers: { cookie, 'x-csrf-token': csrf, 'sec-fetch-site': 'cross-site' }, payload: {} });
  assert.equal(fetchSite.statusCode, 403);
});

test('logout invalida a sessão no servidor', async () => {
  const { cookie, csrf } = await amb.login();
  assert.equal((await amb.criado.app.inject({ method: 'POST', url: `${P}/auth/logout`, headers: { cookie, 'x-csrf-token': csrf } })).statusCode, 204);
  assert.equal((await amb.criado.app.inject({ url: `${P}/auth/me`, headers: { cookie } })).statusCode, 401);
});

test('cada login gera um novo identificador de sessão', async () => {
  const a = await amb.login();
  const b = await amb.login();
  assert.notEqual(a.cookie, b.cookie);
  assert.notEqual(a.csrf, b.csrf);
});

test('senha: hash scrypt sem "$", verificação correta e rejeição de formato inválido', async () => {
  const h = await hashSenha('uma senha longa e boa');
  assert.match(h, /^scrypt\.\d+\.\d+\.\d+\.[\w-]+\.[\w-]+$/);
  assert.ok(!h.includes('$'));
  assert.equal(await verificarSenha('uma senha longa e boa', h), true);
  assert.equal(await verificarSenha('outra', h), false);
  assert.equal(await verificarSenha('x', 'lixo'), false);
  assert.notEqual(await hashSenha('uma senha longa e boa'), h); // sal aleatório
});

test('sessões expiram por tempo absoluto e por ociosidade', async () => {
  const s = new Sessoes(50, 30);
  const x = s.criar('a');
  assert.ok(s.obter(x.id));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(s.obter(x.id), undefined);
});

test('produção exige credenciais e token forte; sem hash gera senha só fora de produção', async () => {
  assert.throws(() => carregarConfig({ AMBIENTE: 'producao' }), /ADMIN_USER/);
  assert.throws(
    () => carregarConfig({ AMBIENTE: 'producao', ADMIN_USER: 'a', ADMIN_PASSWORD_HASH: 'h', ADMIN_TOKEN: 'curto', RABBITMQ_USER: 'u', RABBITMQ_PASSWORD: 'p' }),
    /24 caracteres/,
  );
  const prod = carregarConfig({ AMBIENTE: 'producao', ADMIN_USER: 'a', ADMIN_PASSWORD_HASH: 'h', ADMIN_TOKEN: 'x'.repeat(30), RABBITMQ_USER: 'u', RABBITMQ_PASSWORD: 'p' });
  assert.equal(prod.cookieSeguro, true);
  const local = await ambiente({ ADMIN_PASSWORD_HASH: '' });
  assert.ok(local.criado.senhaInicial && local.criado.senhaInicial.length >= 20);
  await local.fechar();
});

test('limite de tentativas de login por minuto → 429', async () => {
  const a = await ambiente({ LIMITE_LOGIN_POR_MINUTO: '3' });
  const codigos: number[] = [];
  for (let i = 0; i < 5; i++) codigos.push((await a.criado.app.inject({ method: 'POST', url: `${P}/auth/login`, payload: { usuario: USUARIO, senha: 'errada' } })).statusCode);
  assert.deepEqual(codigos.slice(0, 3), [401, 401, 401]);
  assert.ok(codigos.slice(3).every((c) => c === 429), codigos.join());
  await a.fechar();
});
