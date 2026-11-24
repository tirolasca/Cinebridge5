// Uso: node dist/hash-senha.js  (lê a senha do stdin sem eco no terminal quando interativo) -> imprime o hash para ADMIN_PASSWORD_HASH
import { createInterface } from 'node:readline';
import { hashSenha } from './senha';

async function lerSenha(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY });
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      process.stderr.write('Nova senha (mín. 12 caracteres): ');
      rlAny._writeToOutput = () => undefined; // oculta a digitação
    }
    rl.question('', (s) => {
      rl.close();
      process.stderr.write('\n');
      resolve(s);
    });
  });
}

void (async () => {
  const senha = (await lerSenha()).replace(/\r?\n$/, '');
  if (senha.length < 12) {
    process.stderr.write('Senha muito curta (mínimo 12 caracteres).\n');
    process.exit(1);
  }
  process.stdout.write((await hashSenha(senha)) + '\n');
})();
