const { carregarConfig } = require('./config/env');
const { createApp } = require('./app');
const logger = require('./utils/logger');

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { stack: reason?.stack ?? String(reason) });
});

async function iniciar() {
  const config = carregarConfig(); // falha na hora se o JWT_SECRET não estiver no .env
  const app = createApp({ config });

  const admin = await app.locals.usuarios.garantirAdmin(config.admin);
  if (admin) console.log(`Administrador disponível: ${admin.email}`);

  app.listen(config.port, () => {
    console.log(`API rodando em http://localhost:${config.port}`);
    console.log(`Documentação em http://localhost:${config.port}/api-docs`);
  });
}

iniciar().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
