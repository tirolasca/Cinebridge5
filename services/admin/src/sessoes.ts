import { randomBytes } from 'node:crypto';

export interface Sessao {
  id: string;
  usuario: string;
  csrf: string;
  criada: number;
  ultimoUso: number;
}

/** Sessões no servidor (o cookie guarda apenas um identificador aleatório). Perdem-se ao reiniciar o serviço. */
export class Sessoes {
  private mapa = new Map<string, Sessao>();
  constructor(
    private ttlMs: number,
    private ociosoMs: number,
    private maximo = 50,
  ) {}

  criar(usuario: string): Sessao {
    this.limpar();
    if (this.mapa.size >= this.maximo) this.mapa.delete(this.mapa.keys().next().value as string); // descarta a mais antiga
    const agora = Date.now();
    const s: Sessao = { id: randomBytes(32).toString('base64url'), usuario, csrf: randomBytes(24).toString('base64url'), criada: agora, ultimoUso: agora };
    this.mapa.set(s.id, s);
    return s;
  }

  obter(id: string | undefined): Sessao | undefined {
    if (!id) return undefined;
    const s = this.mapa.get(id);
    if (!s) return undefined;
    const agora = Date.now();
    if (agora - s.criada > this.ttlMs || agora - s.ultimoUso > this.ociosoMs) {
      this.mapa.delete(id);
      return undefined;
    }
    s.ultimoUso = agora;
    return s;
  }

  /** Verifica validade SEM renovar o tempo ocioso (usado pelo fluxo SSE). */
  valida(id: string): boolean {
    const s = this.mapa.get(id);
    if (!s) return false;
    const agora = Date.now();
    return agora - s.criada <= this.ttlMs && agora - s.ultimoUso <= this.ociosoMs;
  }

  destruir(id: string): void {
    this.mapa.delete(id);
  }

  limpar(): void {
    const agora = Date.now();
    for (const [id, s] of this.mapa) if (agora - s.criada > this.ttlMs || agora - s.ultimoUso > this.ociosoMs) this.mapa.delete(id);
  }

  get total(): number {
    return this.mapa.size;
  }
}
