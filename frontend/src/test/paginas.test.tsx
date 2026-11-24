import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import {
  UUID_M,
  UUID_P,
  autenticado,
  governanca,
  mensageria,
  mockApi,
  profissionais,
  projeto,
  renderApp,
  resp,
} from './utils';

const metricasOk = {
  geradoEm: new Date().toISOString(),
  prometheusDisponivel: true,
  servicos: [
    {
      id: 'cinebridge-api',
      nome: 'API',
      latenciaP50Ms: 10,
      latenciaP95Ms: 80,
      taxaErros: 0.01,
      cpuPct: 12.5,
      heapBytes: 50 * 1024 * 1024,
      reqPorSegundo: 2,
    },
  ],
};

describe('Profissionais', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lista com paginação, busca e filtro por papel', async () => {
    mockApi({ ...autenticado, 'GET /profissionais': profissionais(12) });
    renderApp('/profissionais');
    expect(await screen.findByText('Profissional 01')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(9); // cabeçalho + 8
    expect(screen.getByText('1–8 de 12')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /próxima página/i }));
    expect(screen.getByText('9–12 de 12')).toBeInTheDocument();
    expect(screen.queryByText('Profissional 01')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'Profissional 03');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText(/buscar por nome/i));
    await userEvent.selectOptions(screen.getByLabelText(/filtrar por papel/i), 'EDITOR');
    expect(screen.getAllByRole('row')).toHaveLength(5); // 4 editores
    await userEvent.type(screen.getByLabelText(/buscar por nome/i), 'zzz');
    expect(screen.getByText(/nenhum resultado para os filtros/i)).toBeInTheDocument();
  });

  it('estado vazio e abertura do detalhe', async () => {
    mockApi({ ...autenticado, 'GET /profissionais': [] });
    renderApp('/profissionais');
    expect(await screen.findByText(/nenhum profissional cadastrado/i)).toBeInTheDocument();
  });

  it('detalhe do profissional abre em diálogo acessível', async () => {
    mockApi({ ...autenticado, 'GET /profissionais': profissionais(3) });
    renderApp('/profissionais');
    await userEvent.click(await screen.findByRole('button', { name: 'Profissional 02' }));
    const d = await screen.findByRole('dialog', { name: 'Profissional 02' });
    expect(within(d).getByText('Competências')).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /fechar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('formulário valida antes de enviar e envia o contrato correto com CSRF', async () => {
    const api = mockApi({
      ...autenticado,
      'GET /profissionais': profissionais(1),
      'POST /profissionais': () => resp(201, { id: 'x' }),
    });
    renderApp('/profissionais');
    await userEvent.click(await screen.findByRole('button', { name: /novo profissional/i }));
    const d = await screen.findByRole('dialog', { name: /novo profissional/i });
    await userEvent.click(within(d).getByRole('button', { name: /cadastrar/i }));
    expect(await within(d).findByText('Informe o nome.')).toBeInTheDocument();
    expect(within(d).getByText(/custo maior que zero/i)).toBeInTheDocument();
    expect(api.doMetodo('POST', '/profissionais')).toHaveLength(0);

    await userEvent.type(within(d).getByLabelText('Nome'), 'Maria Souza');
    await userEvent.selectOptions(within(d).getByLabelText('Papel'), 'EDITOR');
    await userEvent.type(within(d).getByLabelText('Custo (R$)'), '1500,50');
    await userEvent.clear(within(d).getByLabelText(/nota média/i));
    await userEvent.type(within(d).getByLabelText(/nota média/i), '4,5');
    await userEvent.type(within(d).getByLabelText('Competências'), 'cor, ritmo');
    await userEvent.click(within(d).getByRole('button', { name: /cadastrar/i }));
    await waitFor(() => expect(api.doMetodo('POST', '/profissionais')).toHaveLength(1));
    const c = api.doMetodo('POST', '/profissionais')[0]!;
    expect(c.corpo).toEqual({
      nome: 'Maria Souza',
      papel: 'EDITOR',
      custo: 1500.5,
      notaMedia: 4.5,
      competencias: ['cor', 'ritmo'],
    });
    expect(c.headers['x-csrf-token']).toBe('csrf-teste');
    expect(await screen.findByText('Profissional cadastrado.')).toBeInTheDocument();
  });

  it('sem violações de acessibilidade (axe)', async () => {
    mockApi({ ...autenticado, 'GET /profissionais': profissionais(5) });
    const { container } = renderApp('/profissionais');
    await screen.findByText('Profissional 01');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Projetos e recomendações', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('filtra por status e mostra estado vazio quando não há projetos', async () => {
    mockApi({
      ...autenticado,
      'GET /projetos': [projeto(), projeto({ id: UUID_M, titulo: 'Já entregue', status: 'FINALIZADO' })],
    });
    renderApp('/projetos');
    expect(await screen.findByText('Raízes do Sertão')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/filtrar por status/i), 'FINALIZADO');
    expect(screen.queryByText('Raízes do Sertão')).not.toBeInTheDocument();
    expect(screen.getByText('Já entregue')).toBeInTheDocument();
  });

  it('lista vazia orienta o usuário', async () => {
    mockApi({ ...autenticado, 'GET /projetos': [] });
    renderApp('/projetos');
    expect(await screen.findByText(/nenhum projeto ainda/i)).toBeInTheDocument();
  });

  it('detalhe: orçamento, convites e finalização usam os endpoints existentes', async () => {
    const api = mockApi({
      ...autenticado,
      [`GET /projetos/${UUID_P}`]: projeto(),
      [`POST /projetos/${UUID_P}/convites/${UUID_M}`]: () => resp(202, { aceito: true }),
      [`PATCH /projetos/${UUID_P}`]: () => projeto({ status: 'FINALIZADO' }),
      'GET /projetos': [],
    });
    renderApp(`/projetos/${UUID_P}`);
    expect(await screen.findByRole('heading', { name: 'Raízes do Sertão' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /uso do orçamento/i })).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
    expect(screen.getByText(/sem candidato disponível/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /convite de ana lima como aceito/i }));
    await waitFor(() =>
      expect(api.doMetodo('POST', `/projetos/${UUID_P}/convites/${UUID_M}`)).toHaveLength(1),
    );
    expect(api.doMetodo('POST', '/projetos/')[0]!.corpo).toEqual({ aceito: true });
    expect(api.doMetodo('POST', '/projetos/')[0]!.headers['x-csrf-token']).toBe('csrf-teste');

    await userEvent.click(screen.getByRole('button', { name: /finalizar projeto/i }));
    await waitFor(() => expect(api.doMetodo('PATCH', '/projetos/')).toHaveLength(1));
    expect(api.doMetodo('PATCH', '/projetos/')[0]!.corpo).toEqual({ status: 'FINALIZADO' });
    expect(await screen.findByRole('button', { name: /reabrir projeto/i })).toBeInTheDocument();
  });

  it('projeto inexistente mostra estado “não encontrado”', async () => {
    mockApi({
      ...autenticado,
      [`GET /projetos/${UUID_P}`]: () => resp(404, { erro: 'projeto não encontrado' }),
    });
    renderApp(`/projetos/${UUID_P}`);
    expect(await screen.findByText(/projeto não encontrado/i)).toBeInTheDocument();
  });

  it('recomendação: valida, envia o pedido e exibe equipe, custo e estratégia', async () => {
    const api = mockApi({
      ...autenticado,
      'GET /recomendacoes': [
        { id: 1, projetoId: UUID_P, titulo: 'Antigo', criadoEm: '2026-11-17T10:00:00.000Z' },
      ],
      'POST /recomendacoes': () =>
        resp(201, {
          recomendacaoId: 2,
          projetoId: UUID_P,
          estrategia: 'ORCAMENTO',
          itens: [{ papel: 'DIRETOR', profissionalId: UUID_M, nome: 'Ana Lima', custo: 12000 }],
          parcial: true,
          custoPlanejado: 12000,
          dentroDoOrcamento: true,
          aviso: 'Faltou EDITOR',
        }),
    });
    renderApp('/recomendacoes');
    await userEvent.click(await screen.findByRole('button', { name: /recomendar equipe/i }));
    expect(await screen.findByText('Informe o título do projeto.')).toBeInTheDocument();
    expect(api.doMetodo('POST', '/recomendacoes')).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Título do projeto'), 'Novo Doc');
    await userEvent.type(screen.getByLabelText('Orçamento (R$)'), '30000');
    await userEvent.click(screen.getByRole('button', { name: /recomendar equipe/i }));
    expect(await screen.findByText('Estratégia ORCAMENTO')).toBeInTheDocument();
    expect(api.doMetodo('POST', '/recomendacoes')[0]!.corpo).toEqual({
      titulo: 'Novo Doc',
      orcamentoTotal: 30000,
      genero: 'NAO_INFORMADO',
      papeisRequeridos: [{ papel: 'DIRETOR' }, { papel: 'EDITOR' }],
    });
    expect(screen.getByText('Dentro do orçamento')).toBeInTheDocument();
    expect(screen.getByText('Equipe parcial')).toBeInTheDocument();
    expect(screen.getByText('Faltou EDITOR')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir projeto criado/i })).toHaveAttribute(
      'href',
      `/painel/projetos/${UUID_P}`,
    );
    expect(screen.getByText('Antigo')).toBeInTheDocument();
  });
});

describe('Mensageria, observabilidade e governança', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mensageria: oculta filas temporárias por padrão e informa que não há DLQ', async () => {
    mockApi({ ...autenticado, 'GET /mensageria': mensageria() });
    renderApp('/mensageria');
    expect(await screen.findByText('registro-projetos')).toBeInTheDocument();
    expect(screen.queryByText('amq.gen-xyz')).not.toBeInTheDocument();
    expect(screen.getByText(/nenhuma dead-letter queue está configurada/i)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/mostrar filas temporárias/i));
    expect(screen.getByText('amq.gen-xyz')).toBeInTheDocument();
  });

  it('mensageria: RabbitMQ indisponível vira erro com nova tentativa', async () => {
    mockApi({ ...autenticado, 'GET /mensageria': () => resp(502, { erro: 'RabbitMQ indisponível' }) });
    renderApp('/mensageria');
    expect(await screen.findByRole('alert')).toHaveTextContent(/rabbitmq indisponível/i);
  });

  it('observabilidade: abas navegáveis por teclado; Prometheus/Loki ausentes são explicados', async () => {
    mockApi({
      ...autenticado,
      'GET /observabilidade/metricas': { ...metricasOk, prometheusDisponivel: false },
      'GET /observabilidade/logs': () =>
        resp(502, { erro: 'Loki indisponível (perfil de observabilidade completa desligado?)' }),
      'GET /observabilidade/links': {
        grafana: 'http://g',
        jaeger: 'http://j',
        dashboards: [{ nome: 'Saúde Operacional', url: 'http://g/d/x' }],
      },
    });
    renderApp('/observabilidade');
    expect(await screen.findByText(/prometheus indisponível/i)).toBeInTheDocument();
    const aba = screen.getByRole('tab', { name: 'Métricas' });
    aba.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent(/loki indisponível/i);
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Dashboards' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: /saúde operacional/i })).toHaveAttribute(
      'rel',
      'noreferrer noopener',
    );
  });

  it('observabilidade: métricas por serviço e logs com link para o trace', async () => {
    mockApi({
      ...autenticado,
      'GET /observabilidade/metricas': metricasOk,
      'GET /observabilidade/links': { grafana: 'http://g', jaeger: 'http://j', dashboards: [] },
      'GET /observabilidade/logs': {
        linhas: [
          {
            em: '2026-11-18T10:00:00.000Z',
            nivel: 'error',
            servico: 'cinebridge-api',
            mensagem: 'falhou X',
            correlationId: 'abcdef1234567890',
            extra: {},
          },
        ],
      },
    });
    renderApp('/observabilidade');
    expect(await screen.findByText('80 ms')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(await screen.findByText('falhou X')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /trace abcdef12/i })).toHaveAttribute(
      'href',
      'http://j/trace/abcdef1234567890',
    );
  });

  it('governança: estado, auditoria filtrável e escalonamento desativado explicado', async () => {
    mockApi({ ...autenticado, 'GET /governanca': governanca(), 'GET /observabilidade/metricas': metricasOk });
    renderApp('/governanca');
    expect(await screen.findByText(/desativado: sem acesso ao docker/i)).toBeInTheDocument();
    expect(screen.getAllByText('TROCA_ESTRATEGIA_MANUAL').length).toBeGreaterThan(1); // opção do filtro + linha da tabela
    expect(screen.getByText(/operador: admin/)).toBeInTheDocument();
    expect(screen.getByText(/nenhum evento de escalabilidade/i)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/filtrar por ação/i), 'AJUSTE_CACHE');
    expect(screen.queryByText(/operador: admin/)).not.toBeInTheDocument(); // linha da troca manual filtrada
    expect(screen.getByText(/ttlSeg/)).toBeInTheDocument(); // linha do ajuste de cache permanece
  });

  it('governança: troca manual exige confirmação, envia CSRF e atualiza; cancelar não envia nada', async () => {
    const api = mockApi({
      ...autenticado,
      'GET /governanca': governanca(),
      'GET /observabilidade/metricas': metricasOk,
      'POST /governanca/estrategia': () => resp(200, { estrategia: 'ORCAMENTO', alterada: true }),
    });
    renderApp('/governanca');
    await userEvent.click(
      await screen.findByRole('button', { name: /trocar para estratégia por orçamento/i }),
    );
    let d = await screen.findByRole('dialog', { name: /confirmar intervenção manual/i });
    await userEvent.click(within(d).getByRole('button', { name: /cancelar/i }));
    expect(api.doMetodo('POST', '/governanca')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /trocar para estratégia por orçamento/i }));
    d = await screen.findByRole('dialog', { name: /confirmar intervenção manual/i });
    await userEvent.click(within(d).getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(api.doMetodo('POST', '/governanca/estrategia')).toHaveLength(1));
    const c = api.doMetodo('POST', '/governanca/estrategia')[0]!;
    expect(c.corpo).toEqual({ valor: 'ORCAMENTO' });
    expect(c.headers['x-csrf-token']).toBe('csrf-teste');
    expect(await screen.findByText('Estratégia alterada.')).toBeInTheDocument();
  });

  it('governança sem violações de acessibilidade (axe)', async () => {
    mockApi({ ...autenticado, 'GET /governanca': governanca(), 'GET /observabilidade/metricas': metricasOk });
    const { container } = renderApp('/governanca');
    await screen.findByRole('heading', { name: /trilha de auditoria/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('rota inexistente mostra “página não encontrada”', async () => {
    mockApi({ ...autenticado });
    renderApp('/nao-existe');
    expect(await screen.findByText(/página não encontrada/i)).toBeInTheDocument();
  });
});
