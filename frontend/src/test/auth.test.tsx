import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { anonimo, autenticado, mockApi, overview, renderApp, resp } from './utils';

describe('autenticação e rotas protegidas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('anônimo é redirecionado ao login ao abrir uma rota protegida', async () => {
    mockApi(anonimo);
    renderApp('/profissionais');
    expect(await screen.findByRole('heading', { name: /acesso administrativo/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/painel/login');
  });

  it('validação local: campos vazios mostram alerta e não chamam o servidor', async () => {
    const api = mockApi(anonimo);
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/informe usuário e senha/i);
    expect(api.doMetodo('POST', '/auth/login')).toHaveLength(0);
  });

  it('credenciais inválidas exibem mensagem genérica; limite de tentativas (429) tem mensagem própria', async () => {
    let n = 0;
    mockApi({
      ...anonimo,
      'POST /auth/login': () =>
        ++n === 1 ? resp(401, { erro: 'usuário ou senha inválidos' }) : resp(429, { erro: 'limite' }),
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/usuário ou senha inválidos/i);
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/muitas tentativas/i));
  });

  it('login válido leva à visão geral e as mutações seguintes enviam o token CSRF', async () => {
    let logado = false;
    const api = mockApi({
      'GET /auth/me': () => (logado ? resp(200, { usuario: 'admin', csrf: 'csrf-novo' }) : resp(401, {})),
      'POST /auth/login': () => ((logado = true), resp(200, { usuario: 'admin', csrf: 'csrf-novo' })),
      'GET /overview': overview(),
      'POST /auth/logout': () => resp(204),
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
    expect(api.doMetodo('POST', '/auth/login')[0]!.corpo).toEqual({
      usuario: 'admin',
      senha: 'senha-forte-123',
    });
    await userEvent.click(screen.getByRole('button', { name: /sair/i }));
    await screen.findByRole('heading', { name: /acesso administrativo/i });
    expect(api.doMetodo('POST', '/auth/logout')[0]!.headers['x-csrf-token']).toBe('csrf-novo');
  });

  it('sessão expirada (401 em qualquer chamada) volta ao login e limpa o cache', async () => {
    mockApi({ ...autenticado, 'GET /profissionais': () => resp(401, { erro: 'não autenticado' }) });
    renderApp('/profissionais');
    expect(await screen.findByRole('heading', { name: /acesso administrativo/i })).toBeInTheDocument();
  });

  it('tela de login não tem violações de acessibilidade (axe)', async () => {
    mockApi(anonimo);
    const { container } = renderApp('/login');
    await screen.findByRole('heading', { name: /acesso administrativo/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
