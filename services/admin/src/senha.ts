import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const LOG2N = 15; // N = 32768
const R = 8;
const P = 1;
const TAM = 32;
const MAXMEM = 128 * 1024 * 1024;

function derivar(senha: string, sal: Buffer, log2n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(senha.normalize('NFKC'), sal, TAM, { N: 2 ** log2n, r, p, maxmem: MAXMEM }, (e, k) => (e ? reject(e) : resolve(k))),
  );
}

/** Formato: scrypt.<log2N>.<r>.<p>.<sal b64url>.<hash b64url> (sem "$", seguro em .env e Compose). */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await derivar(senha, sal, LOG2N, R, P);
  return ['scrypt', LOG2N, R, P, sal.toString('base64url'), h.toString('base64url')].join('.');
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [alg, l, r, p, sal, hash] = armazenado.split('.');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64url');
  const obtido = await derivar(senha, Buffer.from(sal, 'base64url'), Number(l), Number(r), Number(p)).catch(() => null);
  return !!obtido && obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

export const senhaAleatoria = (): string => randomBytes(18).toString('base64url');
