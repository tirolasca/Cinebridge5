import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/toast';
import { LimiteDeErro } from '@/components/comuns';
import { CarregandoCards } from '@/components/comuns';
import { AppShell } from '@/layouts/AppShell';
import { Protegida } from '@/routes/Protegida';
import { criarQueryClient } from '@/lib/queryClient';
import Login from '@/pages/Login';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Servicos = lazy(() => import('@/pages/Servicos'));
const Profissionais = lazy(() => import('@/pages/Profissionais'));
const Projetos = lazy(() => import('@/pages/Projetos'));
const ProjetoDetalhe = lazy(() => import('@/pages/ProjetoDetalhe'));
const Recomendacoes = lazy(() => import('@/pages/Recomendacoes'));
const Mensageria = lazy(() => import('@/pages/Mensageria'));
const Observabilidade = lazy(() => import('@/pages/Observabilidade'));
const Governanca = lazy(() => import('@/pages/Governanca'));
const NaoEncontrada = lazy(() => import('@/pages/NaoEncontrada'));

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <QueryClientProvider client={criarQueryClient()}>
      <ToastProvider>
        <BrowserRouter basename={basename}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<Protegida />}>
                <Route element={<AppShell />}>
                  {[
                    ['/', <Dashboard />],
                    ['/servicos', <Servicos />],
                    ['/profissionais', <Profissionais />],
                    ['/projetos', <Projetos />],
                    ['/projetos/:id', <ProjetoDetalhe />],
                    ['/recomendacoes', <Recomendacoes />],
                    ['/mensageria', <Mensageria />],
                    ['/observabilidade', <Observabilidade />],
                    ['/governanca', <Governanca />],
                    ['*', <NaoEncontrada />],
                  ].map(([caminho, el]) => (
                    <Route
                      key={String(caminho)}
                      path={String(caminho)}
                      element={
                        <LimiteDeErro>
                          <Suspense fallback={<CarregandoCards />}>{el as React.ReactNode}</Suspense>
                        </LimiteDeErro>
                      }
                    />
                  ))}
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
