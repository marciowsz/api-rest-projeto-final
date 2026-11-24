/**
 * Monta a aplicação Express. Banco e configurações são recebidos por
 * parâmetro, para que os testes usem um banco isolado e um segredo de teste.
 */
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { createDatabase } = require('./db/database');
const { seedProdutos } = require('./db/seed');
const { usuariosService } = require('./services/usuarios.service');
const { produtosService } = require('./services/produtos.service');
const { authRoutes } = require('./routes/auth.routes');
const { usuariosRoutes } = require('./routes/usuarios.routes');
const { produtosRoutes } = require('./routes/produtos.routes');
const { autenticar } = require('./middlewares/auth');
const { errorHandler, notFoundHandler, errorBody } = require('./middlewares/errorHandler');
const { criarOpenApi } = require('./docs/openapi');
const { version } = require('../package.json');

/** Banco padrão: já vem com os 150 produtos de exemplo */
function bancoComDadosDeExemplo() {
  const db = createDatabase();
  seedProdutos(db);
  return db;
}

/**
 * @param {object} opcoes
 * @param {object} opcoes.config  ver src/config/env.js
 * @param {object} [opcoes.db]
 */
function createApp({ config, db = bancoComDadosDeExemplo() }) {
  const app = express();
  const usuarios = usuariosService(db, config);
  const produtos = produtosService(db);
  const exigirLogin = autenticar({ jwtSecret: config.jwtSecret, db });
  const iniciadoEm = Date.now();

  // Atrás do proxy da nuvem (Render), o IP real do cliente vem no X-Forwarded-For
  if (config.trustProxy) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet()); // cabeçalhos de segurança (HSTS, nosniff, frameguard...)
  app.use(cors({ origin: config.corsOrigin ?? '*', exposedHeaders: ['X-Total-Count', 'X-Error-Id'] }));
  app.use(express.json({ limit: '100kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan(config.trustProxy ? 'combined' : 'dev'));

  // Health check: usado pela plataforma de deploy e para "acordar" a API antes da apresentação
  app.get('/health', (req, res) => {
    db.prepare('SELECT 1').get(); // confirma que o banco responde
    res.json({ status: 'ok', versao: version, uptimeSegundos: Math.round((Date.now() - iniciadoEm) / 1000) });
  });

  // Documentação: Swagger UI em /api-docs e o JSON puro em /api-docs.json
  const openapi = criarOpenApi({ versao: version });
  app.get('/api-docs.json', (req, res) => res.json(openapi));
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'API de Loja - Documentação',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  app.get('/', (req, res) => {
    res.json({
      api: 'API de Loja - Projeto Final',
      versao: version,
      documentacao: '/api-docs',
      health: '/health',
      publicas: ['POST /register', 'POST /login', 'GET /produtos', 'GET /produtos/:id'],
      autenticadas: ['GET /perfil', 'GET /usuarios/:id', 'POST /produtos/:id/baixa-estoque'],
      somenteAdmin: [
        'GET /usuarios',
        'PATCH /usuarios/:id/perfil',
        'DELETE /usuarios/:id',
        'POST /produtos',
        'PUT /produtos/:id',
        'PATCH /produtos/:id',
        'DELETE /produtos/:id',
      ],
    });
  });

  // Proteção contra força bruta: limite de tentativas de login/registro por IP
  const limiteAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit ?? 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(
        errorBody(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', [
          { field: 'ip', message: 'Limite de tentativas de login/registro atingido.' },
        ]),
      );
    },
  });
  app.use(['/login', '/register'], limiteAuth);

  app.use('/', authRoutes(usuarios, exigirLogin));
  app.use('/usuarios', usuariosRoutes(usuarios, exigirLogin));
  app.use('/produtos', produtosRoutes(produtos, exigirLogin));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.usuarios = usuarios; // usado pelo server.js para criar o primeiro admin
  return app;
}

module.exports = { createApp };
