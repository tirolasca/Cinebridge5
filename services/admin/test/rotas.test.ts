import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { ambiente, UUID1, UUID2, type Ambiente } from './helpers';

let amb: Ambiente;
let h: { cookie: string; 'x-csrf-token': string };
before(async () => {
  amb = await ambiente();
  const { cookie, csrf } = await amb.login();
  h = { cookie, 'x-csrf-token': csrf };
});
after(() => amb.fechar());
const P = '/painel/api';
const get = (url: string) => amb.criado.app.inject({ url: P + url, headers: { cookie: h.cookie } });
const envia = (metodo: 'POST' | 'PATCH', url: string, payload: unknown) => amb.criado.app.inject({ method: metodo, url: P + url, headers: h, payload: payload as object });

test('profissionais e projetos repassam aos serviços preservando contratos', async () => {
  assert.equal((await get('/profissionais?papel=DIRETOR')).json()[0].nome, 'Ana');
  assert.match(amb.falsos.profissionais.chamadas.at(-1)!.url, /papel=DIRETOR/);
  assert.equal((await get('/projetos')).json()[0].titulo, 'X');
  assert.equal((await get(`/projetos/${UUID1}`)).statusCode, 200);
  assert.equal((await get(`/projetos/${UUID2}`)).statusCode, 404);
  assert.equal((await envia('PATCH', `/projetos/${UUID1}`, { status: 'FINALIZADO' })).statusCode, 200);
  assert.deepEqual(amb.falsos.projetos.chamadas.at(-1)!.corpo, { status: 'FINALIZADO' }); // só campos permitidos
  const conv = await envia('POST', `/projetos/${UUID1}/convites/${UUID2}`, { aceito: true });
  assert.equal(conv.statusCode, 202);
  assert.equal((await get('/notificacoes')).statusCode, 200);
});

test('erros de validação (4xx) do serviço chegam ao cliente; 5xx viram 502 opaco', async () => {
  const r = await envia('POST', '/projetos', {});
  assert.equal(r.statusCode, 400);
  assert.match(r.json().erro, /obrigatórios/);
  const quebrado = await ambiente();
  const { cookie } = await quebrado.login();
  await quebrado.falsos.profissionais.fechar();
  const r2 = await quebrado.criado.app.inject({ url: `${P}/profissionais`, headers: { cookie } });
  assert.equal(r2.statusCode, 502);
  assert.deepEqual(r2.json(), { erro: 'serviço interno indisponível' });
  await quebrado.fechar().catch(() => undefined);
});

test('parâmetros são validados antes de chegar aos serviços (sem injeção de caminho)', async () => {
  const antes = amb.falsos.projetos.chamadas.length;
  assert.equal((await get('/projetos/..%2f..%2fadmin')).statusCode, 400);
  assert.equal((await envia('POST', `/projetos/${UUID1}/convites/xyz`, { aceito: true })).statusCode, 400);
  assert.equal(amb.falsos.projetos.chamadas.length, antes);
  assert.equal((await get('/profissionais?papel=' + 'x'.repeat(60))).statusCode, 400);
});

test('recomendação usa o endpoint existente da API', async () => {
  const r = await envia('POST', '/recomendacoes', { titulo: 'T', orcamentoTotal: 1, papeisRequeridos: [{ papel: 'DIRETOR' }], genero: 'FICCAO', lixo: 1 });
  assert.equal(r.statusCode, 201);
  const c = amb.falsos.api.chamadas.find((x) => x.url === '/projetos/recomendacao')!;
  assert.equal(c.metodo, 'POST');
  assert.ok(!('lixo' in (c.corpo as object)));
});

test('mensageria separa filas duráveis das temporárias e calcula totais', async () => {
  const m = (await get('/mensageria')).json();
  assert.equal(m.totais.filas, 1);
  assert.equal(m.totais.prontas, 3);
  assert.equal(m.totais.consumidores, 1);
  assert.equal(m.filas.at(-1).temporaria, true);
  assert.equal(m.deadLetterConfigurado, false);
});

test('governança: leitura com token interno; intervenção manual validada e atribuída ao operador', async () => {
  const g = (await get('/governanca')).json();
  assert.equal(g.estado.dockerHabilitado, false);
  assert.equal(g.auditoria[0].acao, 'AJUSTE_CACHE');
  assert.match(String(amb.falsos.governanca.chamadas.find((c) => c.url === '/estado')!.auth), /^Bearer token-interno/);
  assert.equal((await envia('POST', '/governanca/estrategia', { valor: 'QUALQUER' })).statusCode, 400);
  assert.equal((await envia('POST', '/governanca/estrategia', { valor: 'ORCAMENTO' })).statusCode, 200);
  const c = amb.falsos.governanca.chamadas.find((x) => x.url === '/acoes/estrategia')!;
  assert.deepEqual(c.corpo, { valor: 'ORCAMENTO', operador: 'admin' });
});

test('observabilidade: filtros validados (sem LogQL arbitrário); fonte ausente → 502 claro', async () => {
  assert.equal((await get('/observabilidade/logs?servico=" or 1=1')).statusCode, 400);
  assert.equal((await get('/observabilidade/logs?nivel=x')).statusCode, 400);
  assert.equal((await get('/observabilidade/logs?busca=' + 'a'.repeat(100))).statusCode, 400);
  assert.equal((await get('/observabilidade/logs')).statusCode, 502); // Loki desligado neste teste
  assert.equal((await get('/observabilidade/traces?servico=malicioso')).statusCode, 400);
  const met = (await get('/observabilidade/metricas')).json();
  assert.equal(met.prometheusDisponivel, true);
  assert.equal(met.servicos.length, 5);
  assert.ok((await get('/observabilidade/links')).json().dashboards.length === 3);
});

test('visão geral agrega serviços, contadores, desempenho, eventos e disponibilidade', async () => {
  const o = (await get('/overview')).json();
  assert.equal(o.saude.estado, 'saudavel');
  assert.equal(o.saude.ok, 5);
  assert.equal(o.contadores.profissionais, 12);
  assert.equal(o.contadores.projetos, 5);
  assert.equal(o.contadores.projetosEmAndamento, 3);
  assert.equal(o.desempenho.filaPendente, 3);
  assert.equal(o.notificacoesRecentes.length, 1);
  assert.equal(o.eventos[0].tipo, 'governanca'); // mais recente primeiro
  assert.equal(o.disponibilidade.length, 2);
  assert.equal(o.fontes.rabbitmq, true);
});

test('visão geral degrada sem Prometheus e sinaliza serviço indisponível', async () => {
  const a = await ambiente({}, false);
  const { cookie } = await a.login();
  await a.falsos.projetos.fechar();
  const o = (await a.criado.app.inject({ url: `${P}/overview`, headers: { cookie } })).json();
  assert.equal(o.fontes.prometheus, false);
  assert.equal(o.contadores.profissionais, null);
  assert.equal(o.servicos.find((s: { id: string }) => s.id === 'cinebridge-projetos').estado, 'indisponivel');
  assert.equal(o.saude.estado, 'degradado');
  await a.fechar().catch(() => undefined);
});

test('SSE entrega o evento "overview" a clientes autenticados e rejeita anônimos', async () => {
  const url = await amb.criado.app.listen({ port: 0, host: '127.0.0.1' });
  const anon = await fetch(`${url}/painel/api/stream`);
  assert.equal(anon.status, 401);
  const ctl = new AbortController();
  const r = await fetch(`${url}/painel/api/stream`, { headers: { cookie: h.cookie }, signal: ctl.signal });
  assert.equal(r.status, 200);
  assert.match(String(r.headers.get('content-type')), /text\/event-stream/);
  const leitor = r.body!.getReader();
  let texto = '';
  while (!texto.includes('event: overview')) {
    const { value, done } = await leitor.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  ctl.abort();
  assert.match(texto, /event: overview\ndata: \{/);
});
