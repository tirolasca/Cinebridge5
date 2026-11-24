import { context, propagation } from './obs';

export interface Resposta<T = unknown> {
  status: number;
  corpo: T;
  ms: number;
}

/** Chamada HTTP a um serviço interno: timeout, JSON e propagação do trace (traceparent). */
export async function chamar<T = unknown>(
  url: string,
  op: { metodo?: string; corpo?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Resposta<T>> {
  const t0 = performance.now();
  const headers: Record<string, string> = { ...(op.corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...op.headers };
  propagation.inject(context.active(), headers);
  const r = await fetch(url, {
    method: op.metodo ?? 'GET',
    headers,
    body: op.corpo === undefined ? undefined : JSON.stringify(op.corpo),
    signal: AbortSignal.timeout(op.timeoutMs ?? 5000),
  });
  const txt = await r.text();
  let corpo: unknown = txt;
  try {
    corpo = txt ? JSON.parse(txt) : null;
  } catch {
    /* resposta não-JSON */
  }
  return { status: r.status, corpo: corpo as T, ms: Math.round(performance.now() - t0) };
}
