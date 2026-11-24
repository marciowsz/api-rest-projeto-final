const { Router } = require('express');
const { validate } = require('../middlewares/validate');
const { registerSchema, loginSchema } = require('../schemas/schemas');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Rotas de autenticação.
 * @param {object} service  usuariosService
 * @param {Function} autenticar  middleware de autenticação JWT
 */
function authRoutes(service, autenticar) {
  const router = Router();

  // POST /register - pública. Cria usuário "comum" com senha em hash bcrypt.
  router.post(
    '/register',
    validate(registerSchema),
    asyncHandler(async (req, res) => {
      const usuario = await service.registrar(req.validated.body);
      res.status(201).location(`/usuarios/${usuario.id}`).json(usuario);
    }),
  );

  // POST /login - pública. Valida as credenciais e devolve o JWT.
  router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.login(req.validated.body));
    }),
  );

  // GET /perfil - privada. Dados do usuário dono do token.
  router.get('/perfil', autenticar, (req, res) => {
    res.json(service.buscarPorId(req.usuario.id));
  });

  return router;
}

module.exports = { authRoutes };
