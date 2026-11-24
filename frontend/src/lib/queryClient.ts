import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/api';

export const criarQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retryDelay: (n) => (import.meta.env.MODE === 'test' ? 5 : Math.min(1000 * 2 ** n, 30_000)),
        retry: (n, e) => !(e instanceof ApiError && [400, 401, 403, 404].includes(e.status)) && n < 1,
      },
    },
  });
