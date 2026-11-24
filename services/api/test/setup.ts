// Deve ser o primeiro import dos testes: desliga a exportação de traces antes de obs.ts ser carregado.
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';
process.env.SERVICO_NOME = 'teste';
process.env.LOG_LEVEL = 'silent';
