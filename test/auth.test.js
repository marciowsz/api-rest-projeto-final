/**
 * Semana 7 - Registro, hash de senha, login JWT, middleware de autenticação,
 * RBAC (403) e documentação Swagger.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { TEST_CONFIG, ADMIN, COMUM, criarContexto, bearer, assertErrorFormat: checar } = require('./helpers');

const assertErrorFormat = (res, status, error) => checar(assert, res, status, error);

let ctx;
beforeEach(async () => {
  ctx = await criarContexto();
});

describe('Parte 1 - Usuários, registro e hash de senha', () => {
  it('POST /register cria usuário "comum" e NÃO retorna a senha', async () => {
    const res = await request(ctx.app)
      .post('/register')
      .send({ nome: 'Bruno', email: 'Bruno@Email.com', senha: 'OutraSenha9' });
    assert.equal(res.status, 201);
    assert.equal(res.body.perfil, 'comum');
    assert.equal(res.body.email, 'bruno@email.com');
    assert.deepEqual(Object.keys(res.body).sort(), ['criadoEm', 'email', 'id', 'nome', 'perfil']);
    assert.ok(!JSON.stringify(res.body).includes('OutraSenha9'));
  });

  it('a senha é salva como hash bcrypt (irreversível), nunca em texto plano', async () => {
    const row = ctx.db.prepare('SELECT senha_hash FROM usuarios WHERE email = ?').get(COMUM.email);
    assert.notEqual(row.senha_hash, COMUM.senha);
    assert.match(row.senha_hash, /^\$2[aby]\$\d{2}\$.{53}$/);
    assert.ok(await bcrypt.compare(COMUM.senha, row.senha_hash));
  });

  it('a mesma senha gera hashes diferentes (salt aleatório)', async () => {
    await request(ctx.app).post('/register').send({ nome: 'Carla', email: 'carla@email.com', senha: COMUM.senha });
    const hashes = ctx.db
      .prepare('SELECT senha_hash FROM usuarios WHERE email IN (?, ?)')
      .all(COMUM.email, 'carla@email.com')
      .map((r) => r.senha_hash);
    assert.notEqual(hashes[0], hashes[1]);
  });

  it('não é possível se registrar como admin', async () => {
    const res = await request(ctx.app)
      .post('/register')
      .send({ nome: 'Hacker', email: 'hacker@email.com', senha: 'Senha12345', perfil: 'admin' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details, [{ field: 'perfil', message: 'Campo não permitido.' }]);
  });

  it('e-mail único: registro duplicado -> 409', async () => {
    const res = await request(ctx.app).post('/register').send({ ...COMUM, email: 'ANA@EMAIL.COM' });
    assertErrorFormat(res, 409, 'USER_ALREADY_EXISTS');
  });

  it('senha fraca -> 400', async () => {
    const res = await request(ctx.app)
      .post('/register')
      .send({ nome: 'Bruno', email: 'b@email.com', senha: 'somenteletras' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.equal(res.body.details[0].message, 'A senha deve conter letras e números.');
  });
});

describe('Parte 2 - Login e proteção com JWT', () => {
  it('POST /login devolve um JWT com o id e o perfil no payload', async () => {
    const res = await request(ctx.app).post('/login').send({ email: COMUM.email, senha: COMUM.senha });
    assert.equal(res.status, 200);
    assert.equal(res.body.tokenType, 'Bearer');
    const payload = jwt.verify(res.body.token, TEST_CONFIG.jwtSecret);
    assert.equal(payload.sub, String(res.body.usuario.id));
    assert.equal(payload.perfil, 'comum');
    assert.ok(payload.exp > payload.iat);
    assert.ok(!('senha' in payload) && !('senha_hash' in payload));
  });

  it('senha errada e e-mail inexistente dão a MESMA resposta (401)', async () => {
    const senhaErrada = await request(ctx.app).post('/login').send({ email: COMUM.email, senha: 'Errada123' });
    const semConta = await request(ctx.app).post('/login').send({ email: 'ninguem@email.com', senha: 'Errada123' });
    assertErrorFormat(senhaErrada, 401, 'INVALID_CREDENTIALS');
    assertErrorFormat(semConta, 401, 'INVALID_CREDENTIALS');
    assert.equal(senhaErrada.body.message, semConta.body.message);
  });

  it('GET /perfil com token válido -> 200', async () => {
    const res = await request(ctx.app).get('/perfil').set(bearer(ctx.tokenComum));
    assert.equal(res.status, 200);
    assert.equal(res.body.email, COMUM.email);
    assert.ok(!('senha_hash' in res.body));
  });

  it('GET /perfil sem token -> 401', async () => {
    const res = await request(ctx.app).get('/perfil');
    assertErrorFormat(res, 401, 'UNAUTHORIZED');
    assert.equal(res.body.details[0].field, 'Authorization');
  });

  it('cabeçalho sem "Bearer" -> 401', async () => {
    const res = await request(ctx.app).get('/perfil').set('Authorization', ctx.tokenComum);
    assertErrorFormat(res, 401, 'UNAUTHORIZED');
  });

  it('token adulterado (assinatura inválida) -> 401', async () => {
    const [h, , s] = ctx.tokenComum.split('.');
    const payloadFalso = Buffer.from(JSON.stringify({ sub: '1', perfil: 'admin' })).toString('base64url');
    const res = await request(ctx.app).get('/perfil').set(bearer(`${h}.${payloadFalso}.${s}`));
    assertErrorFormat(res, 401, 'INVALID_TOKEN');
  });

  it('token assinado com outro segredo -> 401', async () => {
    const falso = jwt.sign({ perfil: 'admin' }, 'outro-segredo-qualquer-com-32-chars!!', { subject: '1' });
    assertErrorFormat(await request(ctx.app).get('/perfil').set(bearer(falso)), 401, 'INVALID_TOKEN');
  });

  it('token com "alg: none" -> 401', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: '1', perfil: 'admin' })).toString('base64url');
    assertErrorFormat(await request(ctx.app).get('/perfil').set(bearer(`${header}.${payload}.`)), 401, 'INVALID_TOKEN');
  });

  it('token expirado -> 401 TOKEN_EXPIRED', async () => {
    const expirado = jwt.sign({ perfil: 'comum', exp: Math.floor(Date.now() / 1000) - 60 }, TEST_CONFIG.jwtSecret, {
      subject: '2',
    });
    assertErrorFormat(await request(ctx.app).get('/perfil').set(bearer(expirado)), 401, 'TOKEN_EXPIRED');
  });

  it('token de usuário excluído -> 401', async () => {
    await request(ctx.app).delete('/usuarios/2').set(bearer(ctx.tokenAdmin));
    assertErrorFormat(await request(ctx.app).get('/perfil').set(bearer(ctx.tokenComum)), 401, 'INVALID_TOKEN');
  });

  it('sem token a resposta é 401 antes mesmo de validar o corpo', async () => {
    const res = await request(ctx.app).post('/produtos').send({});
    assertErrorFormat(res, 401, 'UNAUTHORIZED');
  });
});

describe('Parte 3 - RBAC (403) e Swagger', () => {
  it('DELETE /usuarios/:id como "comum" -> 403 Forbidden', async () => {
    const res = await request(ctx.app).delete('/usuarios/1').set(bearer(ctx.tokenComum));
    assertErrorFormat(res, 403, 'FORBIDDEN');
    assert.deepEqual(res.body.details, [{ field: 'perfil', message: 'Necessário perfil: admin.' }]);
  });

  it('DELETE /usuarios/:id como "admin" -> 204', async () => {
    const res = await request(ctx.app).delete('/usuarios/2').set(bearer(ctx.tokenAdmin));
    assert.equal(res.status, 204);
    assertErrorFormat(await request(ctx.app).get('/usuarios/2').set(bearer(ctx.tokenAdmin)), 404, 'NOT_FOUND');
  });

  it('admin não pode excluir a si mesmo -> 422', async () => {
    const res = await request(ctx.app).delete('/usuarios/1').set(bearer(ctx.tokenAdmin));
    assertErrorFormat(res, 422, 'CANNOT_DELETE_SELF');
  });

  it('rotas de admin: comum -> 403, admin -> sucesso', async () => {
    const produto = { sku: 'CEL-123', nome: 'Celular', categoria: 'eletronicos', preco: 999 };
    const casos = [
      ['get', '/usuarios', undefined, 200],
      ['patch', '/usuarios/2/perfil', { perfil: 'comum' }, 200],
      ['post', '/produtos', produto, 201],
    ];
    for (const [metodo, url, corpo, sucesso] of casos) {
      const comum = await request(ctx.app)[metodo](url).set(bearer(ctx.tokenComum)).send(corpo);
      assert.equal(comum.status, 403, `${metodo} ${url} como comum`);
      const admin = await request(ctx.app)[metodo](url).set(bearer(ctx.tokenAdmin)).send(corpo);
      assert.equal(admin.status, sucesso, `${metodo} ${url} como admin`);
    }
  });

  it('usuário comum vê o próprio cadastro, mas não o de outro (403)', async () => {
    assert.equal((await request(ctx.app).get('/usuarios/2').set(bearer(ctx.tokenComum))).status, 200);
    assertErrorFormat(await request(ctx.app).get('/usuarios/1').set(bearer(ctx.tokenComum)), 403, 'FORBIDDEN');
  });

  it('o perfil vem do banco: rebaixar um admin vale na hora, mesmo com token antigo', async () => {
    await request(ctx.app).patch('/usuarios/2/perfil').set(bearer(ctx.tokenAdmin)).send({ perfil: 'admin' });
    assert.equal((await request(ctx.app).get('/usuarios').set(bearer(ctx.tokenComum))).status, 200);
    await request(ctx.app).patch('/usuarios/2/perfil').set(bearer(ctx.tokenAdmin)).send({ perfil: 'comum' });
    assert.equal((await request(ctx.app).get('/usuarios').set(bearer(ctx.tokenComum))).status, 403);
  });

  it('GET /usuarios (admin) não expõe senhas', async () => {
    const res = await request(ctx.app).get('/usuarios').set(bearer(ctx.tokenAdmin));
    assert.equal(res.body.meta.totalItems, 2);
    assert.ok(!JSON.stringify(res.body).includes('senha'));
    assert.ok(!JSON.stringify(res.body).includes('$2'));
  });

  it('Swagger UI disponível em /api-docs', async () => {
    const res = await request(ctx.app).get('/api-docs/');
    assert.equal(res.status, 200);
    assert.match(res.text, /swagger-ui/i);
  });

  it('OpenAPI documenta Bearer Auth e as rotas protegidas', async () => {
    const { body } = await request(ctx.app).get('/api-docs.json');
    assert.equal(body.openapi, '3.0.3');
    assert.deepEqual(body.components.securitySchemes.bearerAuth, { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    for (const rota of ['/register', '/login', '/perfil', '/usuarios/{id}']) assert.ok(body.paths[rota], rota);
    assert.deepEqual(body.paths['/usuarios/{id}'].delete.security, [{ bearerAuth: [] }]);
    assert.ok(body.paths['/usuarios/{id}'].delete.responses[403]);
    assert.ok(!body.paths['/login'].post.security, 'login é público');
  });
});

describe('Configuração', () => {
  it('a API não sobe sem JWT_SECRET (ou com segredo curto)', () => {
    const { carregarConfig } = require('../src/config/env');
    assert.throws(() => carregarConfig({}), /JWT_SECRET/);
    assert.throws(() => carregarConfig({ JWT_SECRET: 'curto' }), /JWT_SECRET/);
    assert.equal(carregarConfig({ JWT_SECRET: 'x'.repeat(32) }).jwtExpiresIn, '1h');
  });

  it('o primeiro admin vem do .env e não é duplicado', async () => {
    const de_novo = await ctx.app.locals.usuarios.garantirAdmin(ADMIN);
    assert.equal(de_novo.id, 1);
    assert.equal(de_novo.perfil, 'admin');
  });
});
