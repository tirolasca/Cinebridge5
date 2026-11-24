import { carregarConfig } from './config';
import { construirApp } from './app';
import { logger, encerrar } from './obs';

async function main(): Promise<void> {
  const cfg = carregarConfig();
  const { app, senhaInicial } = await construirApp(cfg);
  await app.listen({ port: cfg.porta, host: '0.0.0.0' });
  logger.info({ porta: cfg.porta, base: cfg.base, producao: cfg.producao }, 'Control Center (BFF) iniciado');
  if (senhaInicial) {
    // Somente fora de produção e sem ADMIN_PASSWORD_HASH: senha aleatória, válida até o próximo reinício.
    logger.warn(`Credenciais temporárias de desenvolvimento — usuário: "${cfg.usuario}"  senha: "${senhaInicial}"  (defina ADMIN_PASSWORD_HASH para fixar)`);
  }
  process.on('SIGTERM', () => void app.close().finally(() => encerrar().finally(() => process.exit(0))));
}

main().catch((e) => {
  logger.fatal(e);
  process.exit(1);
});
