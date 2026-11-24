const BASE = process.env.PROMETHEUS_URL ?? 'http://cinebridge-prometheus:9090';

/** Executa uma consulta instantânea e devolve o primeiro valor numérico (null se vazio/NaN). */
export async function consultar(promql: string): Promise<number | null> {
  const r = await fetch(`${BASE}/api/v1/query?query=${encodeURIComponent(promql)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Prometheus respondeu ${r.status}`);
  const j = (await r.json()) as { data?: { result?: { value?: [number, string] }[] } };
  const bruto = j.data?.result?.[0]?.value?.[1];
  const n = Number(bruto);
  return bruto !== undefined && Number.isFinite(n) ? n : null;
}
