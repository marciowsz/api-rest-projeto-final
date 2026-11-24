/**
 * Semana 5 (validação, exceções e erros) - adaptado para as rotas com autenticação.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/db/database');
const { TEST_CONFIG, criarContexto, bearer, assertErrorFormat: checar } = require('./helpers');

const assertErrorFormat = (res, status, error) => checar(assert, res, status, error);

const produtoValido = {
  sku: 'CEL-001',
  nome: 'Smartphone X',
  categoria: 'eletronicos',
  preco: 2499.9,
  estoque: 5,
};

let ctx;
beforeEach(async () => {
  ctx = await criarContexto();
});

const criarProduto = (dados = produtoValido) =>
  request(ctx.app).post('/produtos').set(bearer(ctx.tokenAdmin)).send(dados);

describe('Validação de dados', () => {
  it('recusa e-mail inválido, senha fraca e nome curto no registro (400)', async () => {
    const res = await request(ctx.app)
      .post('/register')
      .send({ nome: 'A', email: 'ana.email.com', senha: '123' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    // a senha "123" quebra duas regras (tamanho e letras+números): as duas aparecem
    assert.deepEqual(res.body.details.map((d) => d.field), ['nome', 'email', 'senha', 'senha']);
  });

  it('lista todos os campos obrigatórios ausentes', async () => {
    const res = await request(ctx.app).post('/register').send({});
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details.map((d) => d.field), ['nome', 'email', 'senha']);
  });

  it('dados inválidos NÃO chegam ao banco de dados', async () => {
    const db = createDatabase(':memory:');
    let consultas = 0;
    const dbEspiao = {
      prepare: (sql) => {
        consultas += 1;
        return db.prepare(sql);
      },
    };
    const app = createApp({ db: dbEspiao, config: TEST_CONFIG });
    consultas = 0;
    await request(app).post('/register').send({ nome: 'A', email: 'x', senha: '1' });
    assert.equal(consultas, 0);
  });

  it('recusa produto com preço 0, categoria e SKU inválidos', async () => {
    const res = await criarProduto({ ...produtoValido, preco: 0, categoria: 'brinquedos', sku: 'abc' });
    assertErrorFormat(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['categoria', 'preco', 'sku']);
  });
});

describe('Tratamento global de erros', () => {
  it('JSON com erro de sintaxe -> 400 INVALID_JSON', async () => {
    const res = await request(ctx.app)
      .post('/login')
      .set('Content-Type', 'application/json')
      .send('{"email": }');
    assertErrorFormat(res, 400, 'INVALID_JSON');
  });

  it('rota inexistente -> 404 ROUTE_NOT_FOUND', async () => {
    assertErrorFormat(await request(ctx.app).get('/clientes'), 404, 'ROUTE_NOT_FOUND');
  });

  it('recurso inexistente -> 404 NOT_FOUND', async () => {
    assertErrorFormat(await request(ctx.app).get('/produtos/999'), 404, 'NOT_FOUND');
  });

  it('erro interno -> 500 genérico, sem stack trace, e a API continua de pé', async () => {
    const db = createDatabase(':memory:');
    const app = createApp({ db, config: TEST_CONFIG });
    const original = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (sql.includes('FROM produtos')) throw new Error('SQLITE_IOERR: disk I/O error at /var/lib/app/db.sqlite');
      return original(sql);
    };
    const res = await request(app).get('/produtos');
    assertErrorFormat(res, 500, 'INTERNAL_SERVER_ERROR');
    const corpo = JSON.stringify(res.body);
    assert.ok(!corpo.includes('SQLITE') && !corpo.includes('/var/lib') && !corpo.includes('at '));
    assert.equal((await request(app).get('/')).status, 200);
  });
});

describe('Exceções customizadas', () => {
  it('ProductAlreadyExistsError -> 409', async () => {
    await criarProduto();
    assertErrorFormat(await criarProduto(), 409, 'PRODUCT_ALREADY_EXISTS');
  });

  it('InsufficientStockError -> 422 e o estoque não muda', async () => {
    await criarProduto(); // estoque 5
    const res = await request(ctx.app)
      .post('/produtos/1/baixa-estoque')
      .set(bearer(ctx.tokenComum))
      .send({ quantidade: 10 });
    assertErrorFormat(res, 422, 'INSUFFICIENT_STOCK');
    assert.equal((await request(ctx.app).get('/produtos/1')).body.estoque, 5);
  });

  it('compra válida -> 200', async () => {
    await criarProduto();
    const res = await request(ctx.app)
      .post('/produtos/1/baixa-estoque')
      .set(bearer(ctx.tokenComum))
      .send({ quantidade: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.estoque, 3);
  });

  it('ProductInactiveError -> 422', async () => {
    await criarProduto({ ...produtoValido, ativo: false });
    const res = await request(ctx.app)
      .post('/produtos/1/baixa-estoque')
      .set(bearer(ctx.tokenComum))
      .send({ quantidade: 1 });
    assertErrorFormat(res, 422, 'PRODUCT_INACTIVE');
  });
});
