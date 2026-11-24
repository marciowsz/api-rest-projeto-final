process.env.NODE_ENV = 'test';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { TEST_CONFIG } = require('./helpers');
const { createDatabase } = require('../src/db/database');
const { seedProdutos } = require('../src/db/seed');

let app;
let db;
before(() => {
  db = createDatabase(':memory:');
  seedProdutos(db); // 150 produtos
  app = createApp({ db, config: TEST_CONFIG });
});

const get = (url) => request(app).get(url);
const contar = (where = '1 = 1', ...valores) =>
  db.prepare(`SELECT COUNT(*) AS n FROM produtos WHERE ${where}`).get(...valores).n;

describe('Parte 1 - Paginação básica', () => {
  it('sem parâmetros: página 1 com 10 itens e metadados', async () => {
    const res = await get('/produtos');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 10);
    assert.deepEqual(
      { ...res.body.meta, links: undefined },
      {
        totalItems: 150,
        itemsPerPage: 10,
        currentPage: 1,
        totalPages: 15,
        hasNextPage: true,
        hasPrevPage: false,
        links: undefined,
      },
    );
    assert.equal(res.headers['x-total-count'], '150');
  });

  it('retorna só a "fatia" pedida (page=2&limit=10 -> ids 11 a 20)', async () => {
    const res = await get('/produtos?page=2&limit=10');
    assert.deepEqual(
      res.body.data.map((p) => p.id),
      [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    );
  });

  it('última página pode vir incompleta (page=4&limit=40 -> 30 itens)', async () => {
    const res = await get('/produtos?page=4&limit=40');
    assert.equal(res.body.data.length, 30);
    assert.equal(res.body.meta.totalPages, 4);
    assert.equal(res.body.meta.hasNextPage, false);
  });

  it('página além do fim retorna data vazio (200), não erro', async () => {
    const res = await get('/produtos?page=99');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.meta.links.next, null);
    assert.equal(res.body.meta.links.prev, '/produtos?page=15&limit=10');
  });

  it('limit acima de 100 é forçado para 100 (proteção contra ?limit=9999999)', async () => {
    const res = await get('/produtos?limit=9999999');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 100);
    assert.equal(res.body.meta.itemsPerPage, 100);
  });

  it('page/limit inválidos retornam 400 no padrão de erro', async () => {
    for (const url of ['/produtos?page=0', '/produtos?page=abc', '/produtos?limit=-5', '/produtos?page=1.5']) {
      const res = await get(url);
      assert.equal(res.status, 400, url);
      assert.equal(res.body.error, 'VALIDATION_ERROR', url);
    }
  });
});

describe('Parte 2 - Ordenação, filtros e metadados', () => {
  it('ordena por preço decrescente', async () => {
    const res = await get('/produtos?sort=preco&order=desc&limit=100');
    const precos = res.body.data.map((p) => p.preco);
    assert.deepEqual(precos, [...precos].sort((a, b) => b - a));
    const maior = db.prepare('SELECT MAX(preco) AS m FROM produtos').get().m;
    assert.equal(precos[0], maior);
  });

  it('ordena por nome crescente', async () => {
    const res = await get('/produtos?sort=nome&order=asc&limit=20');
    const nomes = res.body.data.map((p) => p.nome);
    assert.deepEqual(nomes, [...nomes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('a ordenação é estável entre páginas (nenhum item repetido ou perdido)', async () => {
    const ids = new Set();
    for (let page = 1; page <= 15; page += 1) {
      const res = await get(`/produtos?sort=estoque&page=${page}`);
      res.body.data.forEach((p) => ids.add(p.id));
    }
    assert.equal(ids.size, 150);
  });

  it('campo de ordenação fora da lista é recusado (protege o ORDER BY)', async () => {
    const res = await get('/produtos?sort=preco;DROP TABLE produtos');
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'sort');
    assert.equal(contar(), 150, 'a tabela continua intacta');
  });

  it('filtra por categoria e ativo', async () => {
    const res = await get('/produtos?categoria=eletronicos&ativo=true&limit=100');
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((p) => p.categoria === 'eletronicos' && p.ativo === true));
    assert.equal(res.body.meta.totalItems, contar("categoria = 'eletronicos' AND ativo = 1"));
  });

  it('busca por nome (search) sem diferenciar maiúsculas', async () => {
    const res = await get('/produtos?search=NOTEBOOK&limit=100');
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((p) => p.nome.toLowerCase().includes('notebook')));
  });

  it('search com % é tratado como texto, não como coringa', async () => {
    const res = await get('/produtos?search=%25');
    assert.equal(res.body.meta.totalItems, 0);
  });

  it('parâmetro desconhecido (erro de digitação) é avisado', async () => {
    const res = await get('/produtos?categria=livros');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details, [{ field: 'categria', message: 'Campo não permitido.' }]);
  });

  it('categoria inválida retorna 400', async () => {
    const res = await get('/produtos?categoria=brinquedos');
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].field, 'categoria');
  });

  it('metadados refletem os filtros (totalItems e totalPages)', async () => {
    const res = await get('/produtos?categoria=livros&limit=7');
    const total = contar("categoria = 'livros'");
    assert.equal(res.body.meta.totalItems, total);
    assert.equal(res.body.meta.totalPages, Math.ceil(total / 7));
  });
});

describe('Parte 3 - Filtro de intervalo e HATEOAS', () => {
  it('filtra preço entre minPrice e maxPrice (inclusive)', async () => {
    const res = await get('/produtos?minPrice=100&maxPrice=500&limit=100');
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((p) => p.preco >= 100 && p.preco <= 500));
    assert.equal(res.body.meta.totalItems, contar('preco BETWEEN 100 AND 500'));
  });

  it('só minPrice ou só maxPrice também funcionam', async () => {
    const min = await get('/produtos?minPrice=3000&limit=100');
    assert.ok(min.body.data.every((p) => p.preco >= 3000));
    const max = await get('/produtos?maxPrice=50&limit=100');
    assert.ok(max.body.data.every((p) => p.preco <= 50));
  });

  it('minPrice maior que maxPrice retorna 400', async () => {
    const res = await get('/produtos?minPrice=500&maxPrice=100');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details, [
      { field: 'maxPrice', message: 'O parâmetro maxPrice deve ser maior ou igual a minPrice.' },
    ]);
  });

  it('links de navegação (first, prev, next, last)', async () => {
    const res = await get('/produtos?page=2&limit=10');
    assert.deepEqual(res.body.meta.links, {
      self: '/produtos?page=2&limit=10',
      first: '/produtos?page=1&limit=10',
      prev: '/produtos?page=1&limit=10',
      next: '/produtos?page=3&limit=10',
      last: '/produtos?page=15&limit=10',
    });
  });

  it('primeira página tem prev = null; última tem next = null', async () => {
    const primeira = await get('/produtos?page=1');
    assert.equal(primeira.body.meta.links.prev, null);
    const ultima = await get('/produtos?page=15');
    assert.equal(ultima.body.meta.links.next, null);
  });

  it('os links preservam filtros e ordenação', async () => {
    const res = await get('/produtos?categoria=casa&minPrice=100&sort=preco&order=desc&limit=5');
    assert.equal(
      res.body.meta.links.next,
      '/produtos?page=2&limit=5&sort=preco&order=desc&categoria=casa&minPrice=100',
    );
    // Seguir o link "next" funciona sem montar URL na mão
    const proxima = await get(res.body.meta.links.next);
    assert.equal(proxima.status, 200);
    assert.equal(proxima.body.meta.currentPage, 2);
  });

  it('nenhum resultado: totalPages 0 e links coerentes', async () => {
    const res = await get('/produtos?minPrice=999999');
    assert.equal(res.body.meta.totalItems, 0);
    assert.equal(res.body.meta.totalPages, 0);
    assert.equal(res.body.meta.links.next, null);
    assert.equal(res.body.meta.links.prev, null);
  });
});
