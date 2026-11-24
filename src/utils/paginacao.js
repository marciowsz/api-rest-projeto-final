/**
 * Monta o objeto "meta" da resposta paginada, incluindo os links de
 * navegação (HATEOAS) que preservam os filtros e a ordenação usados.
 */

/** Ordem fixa dos parâmetros nos links gerados */
const ORDEM_PARAMETROS = ['sort', 'order', 'categoria', 'ativo', 'search', 'minPrice', 'maxPrice', 'perfil'];

function montarLink(basePath, query, page) {
  const params = new URLSearchParams({ page: String(page), limit: String(query.limit) });
  for (const chave of ORDEM_PARAMETROS) {
    if (query[chave] !== undefined) params.set(chave, String(query[chave]));
  }
  return `${basePath}?${params.toString()}`;
}

/**
 * @param {object} args
 * @param {number} args.totalItems
 * @param {object} args.query      query já validada ({ page, limit, ...filtros })
 * @param {string} args.basePath   ex.: "/produtos"
 * @param {object} args.explicitos chaves enviadas pelo cliente (sort/order só entram no link se enviados)
 */
function montarMeta({ totalItems, query, basePath, explicitos }) {
  const { page, limit } = query;
  const totalPages = Math.ceil(totalItems / limit);

  const queryLink = { ...query };
  if (!explicitos.has('sort')) delete queryLink.sort;
  if (!explicitos.has('order')) delete queryLink.order;

  const link = (p) => montarLink(basePath, queryLink, p);
  const ultima = Math.max(totalPages, 1);

  return {
    totalItems,
    itemsPerPage: limit,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1 && totalPages > 0,
    links: {
      self: link(page),
      first: link(1),
      prev: page > 1 && totalPages > 0 ? link(Math.min(page - 1, totalPages)) : null,
      next: page < totalPages ? link(page + 1) : null,
      last: link(ultima),
    },
  };
}

module.exports = { montarMeta };
