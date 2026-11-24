const { Router } = require('express');
const { validate } = require('../middlewares/validate');
const { autorizar } = require('../middlewares/auth');
const {
  produtoSchema,
  produtoPatchSchema,
  idParamSchema,
  baixaEstoqueSchema,
  listarProdutosQuerySchema,
} = require('../schemas/schemas');
const { montarMeta } = require('../utils/paginacao');

/**
 * Catálogo de produtos.
 *  - Leitura: pública
 *  - Compra (baixa de estoque): qualquer usuário logado
 *  - Cadastro, alteração (PUT/PATCH) e exclusão: somente admin
 * A autenticação vem ANTES da validação: sem token, a resposta é 401
 * (e não 400), sem revelar as regras do corpo para quem não está logado.
 */
function produtosRoutes(service, autenticar) {
  const router = Router();

  // GET /produtos - pública, paginada (Semana 6)
  router.get('/', validate(listarProdutosQuerySchema, 'query'), (req, res) => {
    const query = req.validated.query;
    const { data, totalItems } = service.listar(query);
    const meta = montarMeta({
      totalItems,
      query,
      basePath: req.baseUrl,
      explicitos: new Set(Object.keys(req.query)),
    });
    res.set('X-Total-Count', String(totalItems)).json({ data, meta });
  });

  // GET /produtos/:id - pública
  router.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
    res.json(service.buscarPorId(req.validated.params.id));
  });

  // POST /produtos - somente admin
  router.post('/', autenticar, autorizar('admin'), validate(produtoSchema), (req, res) => {
    const produto = service.criar(req.validated.body);
    res.status(201).location(`/produtos/${produto.id}`).json(produto);
  });

  // PUT /produtos/:id - substitui o produto inteiro (somente admin)
  router.put(
    '/:id',
    autenticar,
    autorizar('admin'),
    validate(idParamSchema, 'params'),
    validate(produtoSchema),
    (req, res) => {
      res.json(service.atualizar(req.validated.params.id, req.validated.body));
    },
  );

  // PATCH /produtos/:id - atualiza só os campos enviados (somente admin)
  router.patch(
    '/:id',
    autenticar,
    autorizar('admin'),
    validate(idParamSchema, 'params'),
    validate(produtoPatchSchema),
    (req, res) => {
      res.json(service.atualizar(req.validated.params.id, req.validated.body));
    },
  );

  // DELETE /produtos/:id - somente admin
  router.delete('/:id', autenticar, autorizar('admin'), validate(idParamSchema, 'params'), (req, res) => {
    service.excluir(req.validated.params.id);
    res.status(204).end();
  });

  // POST /produtos/:id/baixa-estoque - compra: qualquer usuário logado
  router.post(
    '/:id/baixa-estoque',
    autenticar,
    validate(idParamSchema, 'params'),
    validate(baixaEstoqueSchema),
    (req, res) => {
      res.json(service.baixarEstoque(req.validated.params.id, req.validated.body.quantidade));
    },
  );

  return router;
}

module.exports = { produtosRoutes };
