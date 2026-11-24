const { Router } = require('express');
const { validate } = require('../middlewares/validate');
const { autorizar } = require('../middlewares/auth');
const { ForbiddenError } = require('../errors/AppError');
const { idParamSchema, alterarPerfilSchema, listarUsuariosQuerySchema } = require('../schemas/schemas');
const { montarMeta } = require('../utils/paginacao');

/**
 * Rotas de usuários. TODAS exigem token (autenticar); as administrativas
 * exigem também o perfil "admin" (autorizar('admin') -> 403 se não for).
 */
function usuariosRoutes(service, autenticar) {
  const router = Router();
  router.use(autenticar);

  // GET /usuarios - somente admin
  router.get('/', autorizar('admin'), validate(listarUsuariosQuerySchema, 'query'), (req, res) => {
    const query = req.validated.query;
    const { data, totalItems } = service.listar(query);
    const meta = montarMeta({ totalItems, query, basePath: req.baseUrl, explicitos: new Set() });
    res.json({ data, meta });
  });

  // GET /usuarios/:id - o próprio usuário ou um admin
  router.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
    const { id } = req.validated.params;
    if (req.usuario.perfil !== 'admin' && req.usuario.id !== id) {
      throw new ForbiddenError(['admin', 'o próprio usuário']);
    }
    res.json(service.buscarPorId(id));
  });

  // PATCH /usuarios/:id/perfil - somente admin (promover/rebaixar)
  router.patch(
    '/:id/perfil',
    autorizar('admin'),
    validate(idParamSchema, 'params'),
    validate(alterarPerfilSchema),
    (req, res) => {
      res.json(service.alterarPerfil(req.validated.params.id, req.validated.body.perfil));
    },
  );

  // DELETE /usuarios/:id - somente admin
  router.delete('/:id', autorizar('admin'), validate(idParamSchema, 'params'), (req, res) => {
    service.excluir(req.validated.params.id, req.usuario.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { usuariosRoutes };
