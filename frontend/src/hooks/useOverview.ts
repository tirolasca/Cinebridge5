import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, urlStream } from '@/services/api';
import type { Overview } from '@/types/api';

export type Conexao = 'conectando' | 'ao-vivo' | 'reconectando' | 'polling';

/**
 * Visão geral em tempo real: SSE (um servidor-sent stream; o BFF consolida as consultas) com retry controlado.
 * Após falhas repetidas ou sem suporte a EventSource, cai para polling a cada 30 s — sem martelar a infraestrutura gratuita.
 */
export function useOverview() {
  const qc = useQueryClient();
  const [conexao, setConexao] = useState<Conexao>(
    typeof EventSource === 'undefined' ? 'polling' : 'conectando',
  );
  const falhas = useRef(0);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(urlStream(), { withCredentials: true });
    es.addEventListener('overview', (e) => {
      falhas.current = 0;
      qc.setQueryData<Overview>(['overview'], JSON.parse((e as MessageEvent<string>).data));
      setConexao('ao-vivo');
    });
    es.addEventListener('sessao-expirada', () => {
      es.close();
      void qc.invalidateQueries({ queryKey: ['overview'] }); // a próxima consulta recebe 401 e leva ao login
    });
    es.onerror = () => {
      falhas.current += 1;
      if (falhas.current >= 4) {
        es.close();
        setConexao('polling');
      } else {
        setConexao('reconectando');
      }
    };
    return () => es.close();
  }, [qc]);

  const q = useQuery({
    queryKey: ['overview'],
    queryFn: api.overview,
    staleTime: 5_000,
    refetchInterval: conexao === 'ao-vivo' ? false : 30_000,
    retry: 1,
  });
  return { ...q, conexao };
}
