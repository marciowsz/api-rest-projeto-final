/**
 * Semana 8 - Projeto final: CRUD completo, endurecimento para produção
 * (headers de segurança, CORS, rate limit, health check) e revisão de segredos.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/db/database');
const { TEST_CONFIG, criarContexto, bearer, assertErrorFormat: checar } = require('./helpers');

const assertErrorFormat = (res, status, error) => checar(assert, res, status, error);

let ctx;
beforeEach(async () => {
  ctx = await criarContexto({ seed: true });
});

describe('CRUD completo de produtos', () => {
  it('PUT substitui o produto inteiro (admin)', async () => {
    const novo = { sku: 'ELE-001', nome: 'Smartphone Ultra', categoria: 'eletronicos', preco: 4999.9, estoque: 3 };
    const res = await request(ctx.app).put('/produtos/1').set(bearer(ctx.tokenAdmin)).send(novo);
    assert.equal(res.status, 200);
    assert.equal(res.body.nome, 'Smartphone Ultra');
    assert.equal(res.body.ativo, true, 'PUT aplica o padrão nos campos omitidos');
  });

  it('PUT sem todos os campos obrigatórios -> 400', async () => {
    const res = await request(ctx.app).put('/produtos/1').set(bearer(ctx.tokenAdmin)).send({ preco: 10 });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
  });

  it('PATCH altera só os campos enviados', async () => {
    const antes = (await request(ctx.app).get('/produtos/2')).body;
    const res = await request(ctx.app).patch('/produtos/2').set(bearer(ctx.tokenAdmin)).send({ preco: 99.9 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ...antes, preco: 99.9 });
  });

  it('PATCH vazio -> 400', async () => {
    const res = await request(ctx.app).patch('/produtos/2').set(bearer(ctx.tokenAdmin)).send({});
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.equal(res.body.details[0].message, 'Envie pelo menos um campo para atualizar.');
  });

  it('PATCH com SKU de outro produto -> 409', async () => {
    const res = await request(ctx.app).patch('/produtos/2').set(bearer(ctx.tokenAdmin)).send({ sku: 'ELE-001' });
    assertErrorFormat(res, 409, 'PRODUCT_ALREADY_EXISTS');
  });

  it('PUT/PATCH/DELETE como usuário comum -> 403; sem token -> 401', async () => {
    const corpo = { preco: 1 };
    assertErrorFormat(await request(ctx.app).patch('/produtos/1').set(bearer(ctx.tokenComum)).send(corpo), 403, 'FORBIDDEN');
    assertErrorFormat(await request(ctx.app).delete('/produtos/1').set(bearer(ctx.tokenComum)), 403, 'FORBIDDEN');
    assertErrorFormat(await request(ctx.app).patch('/produtos/1').send(corpo), 401, 'UNAUTHORIZED');
  });

  it('DELETE (admin) -> 204 e depois 404', async () => {
    assert.equal((await request(ctx.app).delete('/produtos/3').set(bearer(ctx.tokenAdmin))).status, 204);
    assertErrorFormat(await request(ctx.app).get('/produtos/3'), 404, 'NOT_FOUND');
  });

  it('PUT/PATCH em produto inexistente -> 404', async () => {
    const res = await request(ctx.app).patch('/produtos/9999').set(bearer(ctx.tokenAdmin)).send({ preco: 1 });
    assertErrorFormat(res, 404, 'NOT_FOUND');
  });
});

describe('Pronto para produção', () => {
  it('GET /health responde e confere o banco', async () => {
    const res = await request(ctx.app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.versao, require('../package.json').version);
  });

  it('cabeçalhos de segurança do Helmet e sem X-Powered-By', async () => {
    const res = await request(ctx.app).get('/produtos');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['strict-transport-security']);
    assert.ok(res.headers['x-frame-options']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('CORS liberado para o frontend e expõe X-Total-Count', async () => {
    const res = await request(ctx.app).get('/produtos').set('Origin', 'https://meu-frontend.com');
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.match(res.headers['access-control-expose-headers'], /X-Total-Count/);
  });

  it('rate limit no login: excesso de tentativas -> 429 no padrão de erro', async () => {
    const app = createApp({ db: createDatabase(':memory:'), config: { ...TEST_CONFIG, authRateLimit: 3 } });
    const tentativa = () => request(app).post('/login').send({ email: 'x@email.com', senha: 'Errada123' });
    for (let i = 0; i < 3; i += 1) assert.equal((await tentativa()).status, 401);
    const bloqueada = await tentativa();
    assertErrorFormat(bloqueada, 429, 'TOO_MANY_REQUESTS');
    assert.ok(bloqueada.headers['ratelimit'] || bloqueada.headers['ratelimit-policy']);
  });

  it('Swagger funciona com o Helmet ativo e documenta todo o CRUD', async () => {
    assert.equal((await request(ctx.app).get('/api-docs/')).status, 200);
    const { body } = await request(ctx.app).get('/api-docs.json');
    const metodos = Object.keys(body.paths['/produtos/{id}']).sort();
    assert.deepEqual(metodos, ['delete', 'get', 'patch', 'put']);
    assert.ok(body.paths['/health']);
  });
});

describe('Revisão de segurança do repositório', () => {
  const raiz = path.join(__dirname, '..');

  it('.env está no .gitignore e existe um .env.example sem segredos reais', () => {
    const gitignore = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8').split(/\r?\n/);
    assert.ok(gitignore.includes('.env'));
    const exemplo = fs.readFileSync(path.join(raiz, '.env.example'), 'utf8');
    assert.match(exemplo, /JWT_SECRET=troque-/);
  });

  it('nenhum segredo fixo no código-fonte (src/)', () => {
    const arquivos = [];
    const percorrer = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const caminho = path.join(dir, item.name);
        if (item.isDirectory()) percorrer(caminho);
        else if (item.name.endsWith('.js')) arquivos.push(caminho);
      }
    };
    percorrer(path.join(raiz, 'src'));
    for (const arquivo of arquivos) {
      const codigo = fs.readFileSync(arquivo, 'utf8');
      assert.doesNotMatch(codigo, /jwtSecret\s*[:=]\s*['"`]/, `segredo fixo em ${arquivo}`);
      assert.doesNotMatch(codigo, /jwt\.sign\([^)]*['"`][^'"`]{16,}['"`]\s*,/, `segredo literal em ${arquivo}`);
    }
  });
});
