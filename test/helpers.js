process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/db/database');
const { seedProdutos } = require('../src/db/seed');

/** Configuração de teste (segredo fixo e bcrypt rápido) */
const TEST_CONFIG = {
  jwtSecret: 'segredo-de-teste-com-mais-de-32-caracteres!!',
  jwtExpiresIn: '1h',
  bcryptRounds: 4,
  authRateLimit: 1000,
};

const ADMIN = { nome: 'Admin', email: 'admin@loja.com', senha: 'AdminSenha123' };
const COMUM = { nome: 'Ana Souza', email: 'ana@email.com', senha: 'SenhaForte123' };

/**
 * Cria app + banco isolados, com um admin e um usuário comum já logados.
 * @param {{ seed?: boolean, db?: object }} [opcoes]
 */
async function criarContexto({ seed = false, db } = {}) {
  const banco = db ?? createDatabase(':memory:');
  if (seed) seedProdutos(banco);
  const app = createApp({ db: banco, config: TEST_CONFIG });

  await app.locals.usuarios.garantirAdmin(ADMIN);
  await request(app).post('/register').send(COMUM);

  const tokenAdmin = (await request(app).post('/login').send({ email: ADMIN.email, senha: ADMIN.senha })).body.token;
  const tokenComum = (await request(app).post('/login').send({ email: COMUM.email, senha: COMUM.senha })).body.token;

  return { app, db: banco, tokenAdmin, tokenComum };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** Confere o padrão de erro: { status, error, message, details, timestamp } */
function assertErrorFormat(assert, res, status, error) {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body).sort(), ['details', 'error', 'message', 'status', 'timestamp']);
  assert.equal(res.body.status, status);
  assert.equal(res.body.error, error);
  assert.ok(Array.isArray(res.body.details));
}

module.exports = { TEST_CONFIG, ADMIN, COMUM, criarContexto, bearer, assertErrorFormat };
