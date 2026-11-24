/**
 * Regras de negócio de produtos.
 */
const {
  NotFoundError,
  ProductAlreadyExistsError,
  InsufficientStockError,
  ProductInactiveError,
} = require('../errors/AppError');

function produtosService(db) {
  const toProduto = (row) => ({
    id: row.id,
    sku: row.sku,
    nome: row.nome,
    categoria: row.categoria,
    preco: row.preco,
    estoque: row.estoque,
    ativo: row.ativo === 1,
    criadoEm: row.criado_em,
  });

  /** Mapa "campo da API" -> "coluna do banco". Só estas colunas podem ir para o ORDER BY. */
  const COLUNAS_ORDENACAO = {
    id: 'id',
    nome: 'nome',
    preco: 'preco',
    estoque: 'estoque',
    criadoEm: 'criado_em',
  };

  /** Escapa % e _ para o LIKE tratar o texto digitado de forma literal */
  const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

  return {
    /**
     * Lista paginada com filtros e ordenação.
     * Executa 2 consultas: COUNT(*) (para os metadados) e a página com LIMIT/OFFSET.
     */
    listar({ page, limit, sort, order, categoria, ativo, search, minPrice, maxPrice }) {
      const condicoes = [];
      const valores = [];

      if (categoria !== undefined) {
        condicoes.push('categoria = ?');
        valores.push(categoria);
      }
      if (ativo !== undefined) {
        condicoes.push('ativo = ?');
        valores.push(ativo ? 1 : 0);
      }
      if (search !== undefined) {
        condicoes.push("nome LIKE ? ESCAPE '\\'");
        valores.push(`%${escaparLike(search)}%`);
      }
      if (minPrice !== undefined) {
        condicoes.push('preco >= ?');
        valores.push(minPrice);
      }
      if (maxPrice !== undefined) {
        condicoes.push('preco <= ?');
        valores.push(maxPrice);
      }

      const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
      const coluna = COLUNAS_ORDENACAO[sort];
      const direcao = order === 'desc' ? 'DESC' : 'ASC';

      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM produtos ${where}`).get(...valores);

      // "id" como desempate garante ordem estável entre páginas
      const rows = db
        .prepare(
          `SELECT * FROM produtos ${where}
           ORDER BY ${coluna} ${direcao}, id ${direcao}
           LIMIT ? OFFSET ?`,
        )
        .all(...valores, limit, (page - 1) * limit);

      return { data: rows.map(toProduto), totalItems: total };
    },

    criar({ sku, nome, categoria, preco, estoque, ativo }) {
      const existente = db.prepare('SELECT id FROM produtos WHERE sku = ?').get(sku);
      if (existente) throw new ProductAlreadyExistsError(sku);

      const { lastInsertRowid } = db
        .prepare(
          'INSERT INTO produtos (sku, nome, categoria, preco, estoque, ativo) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(sku, nome, categoria, preco, estoque, ativo ? 1 : 0);
      return this.buscarPorId(Number(lastInsertRowid));
    },

    buscarPorId(id) {
      const row = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
      if (!row) throw new NotFoundError('Produto', id);
      return toProduto(row);
    },

    /**
     * PUT (substitui tudo) e PATCH (só os campos enviados) usam o mesmo método:
     * mescla os dados novos com o produto atual e grava.
     */
    atualizar(id, dados) {
      const atual = this.buscarPorId(id);
      if (dados.sku && dados.sku !== atual.sku) {
        const outro = db.prepare('SELECT id FROM produtos WHERE sku = ? AND id <> ?').get(dados.sku, id);
        if (outro) throw new ProductAlreadyExistsError(dados.sku);
      }
      const novo = { ...atual, ...dados };
      db.prepare(
        'UPDATE produtos SET sku = ?, nome = ?, categoria = ?, preco = ?, estoque = ?, ativo = ? WHERE id = ?',
      ).run(novo.sku, novo.nome, novo.categoria, novo.preco, novo.estoque, novo.ativo ? 1 : 0, id);
      return this.buscarPorId(id);
    },

    excluir(id) {
      this.buscarPorId(id);
      db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
    },

    /** Venda: dá baixa no estoque. Falha com 422 se não houver unidades. */
    baixarEstoque(id, quantidade) {
      const produto = this.buscarPorId(id);
      if (!produto.ativo) throw new ProductInactiveError(id);
      if (quantidade > produto.estoque) throw new InsufficientStockError(produto.estoque, quantidade);

      db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(quantidade, id);
      return this.buscarPorId(id);
    },
  };
}

module.exports = { produtosService };
