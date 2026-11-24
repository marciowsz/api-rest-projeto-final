/**
 * O Express 4 não captura erros de funções async sozinho.
 * Este wrapper encaminha qualquer rejeição para o middleware global de erros.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
