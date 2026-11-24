import { act, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { autenticado, mockApi, overview, renderApp, resp } from './utils';

class FakeEventSource {
  static instancias: FakeEventSource[] = [];
  ouvintes: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: (() => void) | null = null;
  fechado = false;
  constructor(public url: string) {
    FakeEventSource.instancias.push(this);
  }
  addEventListener(tipo: string, fn: (e: MessageEvent) => void) {
    (this.ouvintes[tipo] ??= []).push(fn);
  }
  close() {
    this.fechado = true;
  }
  emitir(tipo: string, dados: unknown) {
    this.ouvintes[tipo]?.forEach((f) => f({ data: JSON.stringify(dados) } as MessageEvent));
  }
}

describe('Visão geral', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instancias = [];
  });

  it('mostra esqueleto durante o carregamento e depois os indicadores reais', async () => {
    mockApi({ ...autenticado, 'GET /overview': overview() });
    renderApp('/');
    expect(await screen.findAllByRole('status', { name: /carregando/i })).not.toHaveLength(0);
    expect(await screen.findByText(/todos os serviços estão operando normalmente/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // profissionais
    expect(screen.getByText(/4 em andamento/)).toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
    expect(screen.getByText('0,20%')).toBeInTheDocument();
    expect(screen.getByText('Novo projeto criado')).toBeInTheDocument();
    for (const nome of ['API', 'Profissionais', 'Projetos', 'Notificações', 'Governança'])
      expect(screen.getAllByText(nome).length).toBeGreaterThan(0);
  });

  it('serviço indisponível e fontes ausentes são sinalizados; valores desconhecidos aparecem como “—”', async () => {
    const o = overview({
      saude: { estado: 'critico', ok: 4, total: 5 },
      fontes: { prometheus: false, rabbitmq: true, governanca: true },
      contadores: { profissionais: null, projetos: null, projetosEmAndamento: null },
      disponibilidade: [],
    });
    o.servicos[0] = { ...o.servicos[0]!, estado: 'indisponivel', latenciaMs: null };
    mockApi({ ...autenticado, 'GET /overview': o });
    renderApp('/');
    expect(await screen.findByText(/falha crítica/i)).toBeInTheDocument();
    expect(screen.getByText(/fontes indisponíveis: prometheus/i)).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText(/sem histórico de disponibilidade/i)).toBeInTheDocument();
  });

  it('erro de carregamento mostra alerta com “Tentar novamente” que refaz a consulta', async () => {
    let n = 0;
    const api = mockApi({
      ...autenticado,
      'GET /overview': () => (++n <= 2 ? resp(502, { erro: 'serviço interno indisponível' }) : overview()),
    });
    renderApp('/');
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/serviço interno indisponível/i);
    await act(async () =>
      (await import('@testing-library/user-event')).default.click(
        within(alerta).getByRole('button', { name: /tentar novamente/i }),
      ),
    );
    expect(await screen.findByText(/todos os serviços/i)).toBeInTheDocument();
    expect(api.doMetodo('GET', '/overview').length).toBeGreaterThanOrEqual(3);
  });

  it('SSE: recebe atualizações “ao vivo” sem polling; após falhas repetidas cai para polling', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const api = mockApi({ ...autenticado, 'GET /overview': overview() });
    renderApp('/');
    await screen.findByText(/todos os serviços/i);
    const es = FakeEventSource.instancias[0]!;
    expect(es.url).toBe('/painel/api/stream');
    await act(async () =>
      es.emitir(
        'overview',
        overview({ contadores: { profissionais: 99, projetos: 1, projetosEmAndamento: 1 } }),
      ),
    );
    expect(await screen.findByText('99')).toBeInTheDocument();
    expect(screen.getByText('Ao vivo')).toBeInTheDocument();
    const antes = api.doMetodo('GET', '/overview').length;
    await act(async () => {
      es.onerror?.();
    });
    expect(await screen.findByText(/reconectando/i)).toBeInTheDocument();
    await act(async () => {
      es.onerror?.();
      es.onerror?.();
      es.onerror?.();
    });
    expect(await screen.findByText(/atualização a cada 30 s/i)).toBeInTheDocument();
    expect(es.fechado).toBe(true);
    expect(api.doMetodo('GET', '/overview').length).toBeGreaterThanOrEqual(antes);
  });

  it('sem violações de acessibilidade (axe)', async () => {
    mockApi({ ...autenticado, 'GET /overview': overview() });
    const { container } = renderApp('/');
    await screen.findByText(/todos os serviços/i);
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });

  it('menu móvel: abre e fecha com aria-expanded; link para o conteúdo existe', async () => {
    mockApi({ ...autenticado, 'GET /overview': overview() });
    renderApp('/');
    await screen.findByText(/todos os serviços/i);
    const user = (await import('@testing-library/user-event')).default;
    const botao = screen.getByRole('button', { name: /abrir menu/i });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    await user.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: /serviços/i }));
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: /pular para o conteúdo/i })).toHaveAttribute('href', '#conteudo');
  });
});
