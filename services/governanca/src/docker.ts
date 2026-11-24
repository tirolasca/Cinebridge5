/** Cliente mínimo da API do Docker Engine via socket Unix (sem dependências externas). */
import http from 'node:http';

const SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const ROTULO_SERVICO = 'cinebridge.servico';
const ROTULO_REPLICA = 'cinebridge.replica';

function chamar<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; corpo: T }> {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? undefined : JSON.stringify(corpo);
    const req = http.request(
      {
        socketPath: SOCKET,
        path: caminho,
        method: metodo,
        headers: dados ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados) } : {},
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(partes).toString();
          let parsed: unknown = txt;
          try {
            parsed = txt ? JSON.parse(txt) : null;
          } catch {
            /* resposta não-JSON */
          }
          resolve({ status: res.statusCode ?? 0, corpo: parsed as T });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('tempo esgotado na API do Docker')));
    if (dados) req.write(dados);
    req.end();
  });
}

const filtro = (rotulos: string[]) => encodeURIComponent(JSON.stringify({ label: rotulos }));

interface Resumo {
  Id: string;
  Names: string[];
  Created: number;
  Labels: Record<string, string>;
}

async function listar(rotulos: string[]): Promise<Resumo[]> {
  const r = await chamar<Resumo[]>('GET', `/containers/json?filters=${filtro(rotulos)}`);
  if (r.status !== 200) throw new Error(`listar containers: HTTP ${r.status}`);
  return r.corpo;
}

export async function replicas(servico: string): Promise<Resumo[]> {
  const todos = await listar([`${ROTULO_SERVICO}=${servico}`, `${ROTULO_REPLICA}=true`]);
  return todos.sort((a, b) => a.Created - b.Created);
}

/** Inicia um novo container idêntico ao serviço original, na mesma rede (sem portas publicadas). */
export async function iniciarReplica(servico: string): Promise<string> {
  const base = (await listar([`${ROTULO_SERVICO}=${servico}`])).find((c) => c.Labels[ROTULO_REPLICA] !== 'true');
  if (!base) throw new Error(`container base de ${servico} não encontrado`);
  const info = (await chamar('GET', `/containers/${base.Id}/json`)).corpo;

  const existentes = new Set((await replicas(servico)).map((r) => r.Names[0].replace(/^\//, '')));
  let n = 2;
  while (existentes.has(`${servico}-r${n}`)) n++;
  const nome = `${servico}-r${n}`;

  // Remove rótulos do Compose (para o `docker compose up` não confundir a réplica com o container original).
  const rotulos = Object.fromEntries(Object.entries(info.Config.Labels ?? {}).filter(([k]) => !k.startsWith('com.docker.compose.')));
  rotulos[ROTULO_REPLICA] = 'true';
  const rede = Object.keys(info.NetworkSettings.Networks)[0];

  const criado = await chamar<{ Id: string; message?: string }>('POST', `/containers/create?name=${encodeURIComponent(nome)}`, {
    Image: info.Config.Image,
    Env: info.Config.Env,
    Labels: rotulos,
    Healthcheck: info.Config.Healthcheck,
    ExposedPorts: info.Config.ExposedPorts,
    HostConfig: {
      RestartPolicy: { Name: 'unless-stopped' },
      NetworkMode: rede,
      LogConfig: info.HostConfig.LogConfig,
    },
    NetworkingConfig: { EndpointsConfig: { [rede]: {} } },
  });
  if (criado.status !== 201) throw new Error(`criar ${nome}: ${criado.corpo?.message ?? criado.status}`);
  const iniciado = await chamar('POST', `/containers/${criado.corpo.Id}/start`);
  if (![204, 304].includes(iniciado.status)) throw new Error(`iniciar ${nome}: HTTP ${iniciado.status}`);
  return nome;
}

/** Encerra e remove a réplica mais recente do serviço. Devolve o nome removido (ou null). */
export async function removerReplica(servico: string, espera = 10): Promise<string | null> {
  const lista = await replicas(servico);
  const alvo = lista[lista.length - 1];
  if (!alvo) return null;
  await chamar('POST', `/containers/${alvo.Id}/stop?t=${espera}`);
  await chamar('DELETE', `/containers/${alvo.Id}?force=true`);
  return alvo.Names[0].replace(/^\//, '');
}

export async function removerTodasReplicas(servicos: string[]): Promise<void> {
  await Promise.all(
    servicos.map(async (s) => {
      for (let i = 0; i < 10 && (await replicas(s)).length > 0; i++) await removerReplica(s, 2);
    }),
  );
}

/** Tamanho (bytes) dos volumes, indexado pelo nome. */
export async function tamanhosVolumes(): Promise<Map<string, number>> {
  const r = await chamar<{ Volumes?: { Name: string; UsageData?: { Size: number } }[] }>('GET', '/system/df?type=volume');
  const mapa = new Map<string, number>();
  for (const v of r.corpo.Volumes ?? []) if ((v.UsageData?.Size ?? -1) >= 0) mapa.set(v.Name, v.UsageData!.Size);
  return mapa;
}
