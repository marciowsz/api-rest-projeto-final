/**
 * Middleware de validação com Zod.
 *
 * Valida body, params ou query ANTES de a requisição chegar à rota.
 * Se algo estiver errado, lança ValidationError (400) e o banco de dados
 * nem é consultado.
 */
const { ValidationError } = require('../errors/AppError');

function formatZodIssues(issues) {
  return issues.flatMap((issue) => {
    // Campo enviado que não existe no schema (ex.: "perfil": "admin")
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, message: 'Campo não permitido.' }));
    }
    return [{ field: issue.path.join('.') || 'body', message: issue.message }];
  });
}

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'params'|'query'} source
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ValidationError(formatZodIssues(result.error.issues)));
    }
    // Dados já validados e convertidos (ex.: "5" -> 5) ficam em req.validated
    req.validated = { ...req.validated, [source]: result.data };
    return next();
  };
}

module.exports = { validate, formatZodIssues };
