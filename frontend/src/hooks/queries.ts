import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { NovaRecomendacao, NovoProfissional, Projeto } from '@/types/api';

const SEGUNDOS = (n: number) => n * 1000;

export const useServicos = () =>
  useQuery({ queryKey: ['servicos'], queryFn: api.servicos, refetchInterval: SEGUNDOS(15), retry: 1 });
export const useProfissionais = () => useQuery({ queryKey: ['profissionais'], queryFn: api.profissionais });
export const useProjetos = () => useQuery({ queryKey: ['projetos'], queryFn: api.projetos });
export const useProjeto = (id: string) =>
  useQuery({ queryKey: ['projeto', id], queryFn: () => api.projeto(id) });
export const useRecomendacoes = () => useQuery({ queryKey: ['recomendacoes'], queryFn: api.recomendacoes });
export const useMensageria = () =>
  useQuery({ queryKey: ['mensageria'], queryFn: api.mensageria, refetchInterval: SEGUNDOS(10), retry: 1 });
export const useMetricas = () =>
  useQuery({ queryKey: ['metricas'], queryFn: api.metricas, refetchInterval: SEGUNDOS(30), retry: 1 });
export const useLinks = () => useQuery({ queryKey: ['links'], queryFn: api.links, staleTime: Infinity });
export const useGovernanca = () =>
  useQuery({ queryKey: ['governanca'], queryFn: api.governanca, refetchInterval: SEGUNDOS(15), retry: 1 });
export const useLogs = (f: { servico?: string; nivel?: string; busca?: string }) =>
  useQuery({ queryKey: ['logs', f], queryFn: () => api.logs({ ...f, limite: 100 }), retry: false });
export const useTraces = (servico: string) =>
  useQuery({ queryKey: ['traces', servico], queryFn: () => api.traces(servico), retry: false });

export function useCriarProfissional() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: NovoProfissional) => api.criarProfissional(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profissionais'] }),
  });
}
export function useCriarProjeto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { titulo: string; orcamentoTotal: number; genero?: string }) => api.criarProjeto(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projetos'] }),
  });
}
export function useAtualizarProjeto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { titulo?: string; status?: Projeto['status'] }) => api.atualizarProjeto(id, p),
    onSuccess: (novo) => {
      qc.setQueryData(['projeto', id], novo);
      void qc.invalidateQueries({ queryKey: ['projetos'] });
    },
  });
}
export const useConvite = (id: string) =>
  useMutation({
    mutationFn: (v: { profissionalId: string; aceito: boolean }) =>
      api.convite(id, v.profissionalId, v.aceito),
  });
export function useRecomendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: NovaRecomendacao) => api.recomendar(r),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projetos'] });
      void qc.invalidateQueries({ queryKey: ['recomendacoes'] });
    },
  });
}
export function useTrocarEstrategia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: 'PRINCIPAL' | 'ORCAMENTO') => api.trocarEstrategia(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['governanca'] }),
  });
}
