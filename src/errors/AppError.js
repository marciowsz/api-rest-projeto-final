/**
 * Erros da aplicação (Custom Exceptions).
 *
 * Toda regra de negócio que falha lança uma dessas classes. O middleware
 * global (src/middlewares/errorHandler.js) converte cada uma no status HTTP
 * correto, sempre no mesmo formato JSON.
 */
class AppError extends Error {
  /**
   * @param {number} status   status HTTP (4xx)
   * @param {string} code     código estável para o frontend (ex.: VALIDATION_ERROR)
   * @param {string} message  mensagem legível para o usuário
   * @param {{field: string, message: string}[]} [details]
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 400 - dados de entrada inválidos */
class ValidationError extends AppError {
  constructor(details, message = 'Os dados fornecidos são inválidos.') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/** 404 - recurso não encontrado */
class NotFoundError extends AppError {
  constructor(recurso, id) {
    super(404, 'NOT_FOUND', `${recurso} não encontrado.`, [
      { field: 'id', message: `Não existe ${recurso.toLowerCase()} com id ${id}.` },
    ]);
  }
}

/** 409 - e-mail já cadastrado */
class UserAlreadyExistsError extends AppError {
  constructor(email) {
    super(409, 'USER_ALREADY_EXISTS', 'Já existe um usuário cadastrado com este e-mail.', [
      { field: 'email', message: `O e-mail ${email} já está em uso.` },
    ]);
  }
}

/** 409 - SKU de produto já cadastrado */
class ProductAlreadyExistsError extends AppError {
  constructor(sku) {
    super(409, 'PRODUCT_ALREADY_EXISTS', 'Já existe um produto cadastrado com este SKU.', [
      { field: 'sku', message: `O SKU ${sku} já está em uso.` },
    ]);
  }
}

/** 422 - a requisição é válida, mas a regra de negócio impede (estoque insuficiente) */
class InsufficientStockError extends AppError {
  constructor(disponivel, solicitado) {
    super(422, 'INSUFFICIENT_STOCK', 'Estoque insuficiente para esta operação.', [
      {
        field: 'quantidade',
        message: `Solicitado ${solicitado}, mas só há ${disponivel} unidade(s) em estoque.`,
      },
    ]);
  }
}

/** 422 - operação em produto inativo */
class ProductInactiveError extends AppError {
  constructor(id) {
    super(422, 'PRODUCT_INACTIVE', 'O produto está inativo e não pode ser vendido.', [
      { field: 'id', message: `O produto ${id} está desativado.` },
    ]);
  }
}

/** 401 - não autenticado (sem token, token inválido/expirado, login errado) */
class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', message = 'Autenticação necessária.', details = []) {
    super(401, code, message, details);
  }
}

/** 401 - e-mail ou senha incorretos (mensagem igual nos dois casos, de propósito) */
class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  }
}

/** 403 - autenticado, mas sem permissão (RBAC) */
class ForbiddenError extends AppError {
  constructor(perfisPermitidos) {
    super(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.', [
      { field: 'perfil', message: `Necessário perfil: ${perfisPermitidos.join(' ou ')}.` },
    ]);
  }
}

/** 422 - um administrador não pode excluir a própria conta */
class SelfDeleteError extends AppError {
  constructor() {
    super(422, 'CANNOT_DELETE_SELF', 'Um administrador não pode excluir a própria conta.', [
      { field: 'id', message: 'Peça para outro administrador fazer esta exclusão.' },
    ]);
  }
}

module.exports = {
  AppError,
  UnauthorizedError,
  InvalidCredentialsError,
  ForbiddenError,
  SelfDeleteError,
  ValidationError,
  NotFoundError,
  UserAlreadyExistsError,
  ProductAlreadyExistsError,
  InsufficientStockError,
  ProductInactiveError,
};
