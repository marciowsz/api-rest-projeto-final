/**
 * Middlewares de autenticação (quem é você?) e autorização (o que você pode fazer?).
 */
const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');

/**
 * Autenticação: exige "Authorization: Bearer <token>", valida assinatura e
 * expiração do JWT e confere se o usuário ainda existe.
 */
function autenticar({ jwtSecret, db }) {
  return (req, res, next) => {
    const header = req.get('Authorization') || '';
    const [tipo, token] = header.split(' ');

    if (!header) {
      return next(new UnauthorizedError('UNAUTHORIZED', 'Token de autenticação não informado.', [
        { field: 'Authorization', message: 'Envie o cabeçalho Authorization: Bearer <token>.' },
      ]));
    }
    if (tipo !== 'Bearer' || !token) {
      return next(new UnauthorizedError('UNAUTHORIZED', 'Formato do token inválido.', [
        { field: 'Authorization', message: 'Use o formato: Bearer <token>.' },
      ]));
    }

    let payload;
    try {
      // algorithms fixo impede ataques que trocam o algoritmo (ex.: "alg": "none")
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    } catch (erro) {
      if (erro.name === 'TokenExpiredError') {
        return next(new UnauthorizedError('TOKEN_EXPIRED', 'O token expirou. Faça login novamente.'));
      }
      return next(new UnauthorizedError('INVALID_TOKEN', 'Token inválido.'));
    }

    // O usuário pode ter sido excluído ou ter mudado de perfil depois do login:
    // o perfil usado na autorização vem do banco, não só do token.
    const usuario = db.prepare('SELECT id, perfil FROM usuarios WHERE id = ?').get(Number(payload.sub));
    if (!usuario) {
      return next(new UnauthorizedError('INVALID_TOKEN', 'O usuário deste token não existe mais.'));
    }

    req.usuario = { id: usuario.id, perfil: usuario.perfil };
    return next();
  };
}

/**
 * Autorização por perfil (RBAC). Use DEPOIS de autenticar().
 * Ex.: router.delete('/:id', autenticar, autorizar('admin'), ...)
 */
function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    if (!perfisPermitidos.includes(req.usuario?.perfil)) {
      return next(new ForbiddenError(perfisPermitidos));
    }
    return next();
  };
}

module.exports = { autenticar, autorizar };
