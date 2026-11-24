/**
 * Middleware Global de Erros (Global Exception Handler).
 *
 * Todo erro da aplicação termina aqui e sai no MESMO formato:
 * { status, error, message, details, timestamp }
 */
const { randomUUID } = require('node:crypto');
const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

function errorBody(status, error, message, details = []) {
  return { status, error, message, details, timestamp: new Date().toISOString() };
}

/** 404 para qualquer rota que não existe */
function notFoundHandler(req, res) {
  res.status(404).json(
    errorBody(404, 'ROUTE_NOT_FOUND', 'A rota solicitada não existe.', [
      { field: 'url', message: `${req.method} ${req.originalUrl} não foi encontrada.` },
    ]),
  );
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 1) Erros conhecidos da aplicação (validação, regras de negócio)
  if (err instanceof AppError) {
    return res.status(err.status).json(errorBody(err.status, err.code, err.message, err.details));
  }

  // 2) JSON malformado no corpo da requisição (erro do express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(
      errorBody(400, 'INVALID_JSON', 'O corpo da requisição não é um JSON válido.', [
        { field: 'body', message: 'Verifique aspas, vírgulas e chaves do JSON enviado.' },
      ]),
    );
  }

  // 3) Corpo grande demais
  if (err.type === 'entity.too.large') {
    return res.status(413).json(
      errorBody(413, 'PAYLOAD_TOO_LARGE', 'O corpo da requisição excede o tamanho permitido.'),
    );
  }

  // 4) Qualquer outro erro = erro interno (500).
  //    O detalhe (stack trace, SQL, caminho de arquivos) vai SÓ para o log interno.
  const errorId = randomUUID();
  logger.error(err.message, {
    errorId,
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
  });

  return res
    .status(500)
    .set('X-Error-Id', errorId)
    .json(
      errorBody(500, 'INTERNAL_SERVER_ERROR', 'Erro interno no servidor. Tente novamente mais tarde.', [
        { field: 'errorId', message: `Informe o código ${errorId} ao suporte.` },
      ]),
    );
}

module.exports = { errorHandler, notFoundHandler, errorBody };
