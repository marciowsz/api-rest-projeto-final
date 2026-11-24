/**
 * Documentação OpenAPI 3 da API (servida pelo Swagger UI em /api-docs).
 * O botão "Authorize" aceita o token JWT (Bearer) para testar as rotas protegidas.
 */
const { CATEGORIAS, CAMPOS_ORDENACAO, PERFIS } = require('../schemas/schemas');

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const erro = (descricao, exemplo) => ({
  description: descricao,
  content: { 'application/json': { schema: ref('Erro'), ...(exemplo ? { example: exemplo } : {}) } },
});
const exemploErro = (status, error, message, details = []) => ({
  status,
  error,
  message,
  details,
  timestamp: '2026-11-24T12:00:00.000Z',
});

const R401 = erro(
  'Token ausente, inválido ou expirado',
  exemploErro(401, 'UNAUTHORIZED', 'Token de autenticação não informado.', [
    { field: 'Authorization', message: 'Envie o cabeçalho Authorization: Bearer <token>.' },
  ]),
);
const R403 = erro(
  'Usuário autenticado sem o perfil necessário',
  exemploErro(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.', [
    { field: 'perfil', message: 'Necessário perfil: admin.' },
  ]),
);
const R400 = erro('Dados inválidos');
const R404 = erro('Recurso não encontrado');
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const seguro = [{ bearerAuth: [] }];

const R429 = erro(
  'Muitas tentativas de login/registro (proteção contra força bruta)',
  exemploErro(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'),
);

function criarOpenApi({ serverUrl = '/', versao = '1.0.0' } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'API de Loja - Projeto Final',
      version: versao,
      description:
        'API REST completa: CRUD de produtos, validação, erros padronizados, paginação/filtros, ' +
        'login com JWT, senhas com hash bcrypt e controle de acesso por perfil (RBAC).\n\n' +
        '**Como testar as rotas protegidas:** faça `POST /login`, copie o `token` da resposta, ' +
        'clique em **Authorize** (cadeado) e cole o token.\n\n' +
        'Todas as respostas de erro seguem o mesmo formato `Erro`.',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Status', description: 'Saúde da API' },
      { name: 'Autenticação', description: 'Registro, login e perfil do usuário logado' },
      { name: 'Usuários', description: 'Administração de usuários (somente admin)' },
      { name: 'Produtos', description: 'Catálogo: leitura pública, escrita somente admin' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Erro: {
          type: 'object',
          required: ['status', 'error', 'message', 'details', 'timestamp'],
          properties: {
            status: { type: 'integer', example: 400 },
            error: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Os dados fornecidos são inválidos.' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'O formato do e-mail está incorreto.' },
                },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Usuario: {
          type: 'object',
          description: 'A senha e o hash da senha NUNCA são retornados.',
          properties: {
            id: { type: 'integer', example: 2 },
            nome: { type: 'string', example: 'Ana Souza' },
            email: { type: 'string', format: 'email', example: 'ana@email.com' },
            perfil: { type: 'string', enum: PERFIS, example: 'comum' },
            criadoEm: { type: 'string', format: 'date-time' },
          },
        },
        RegisterInput: {
          type: 'object',
          required: ['nome', 'email', 'senha'],
          additionalProperties: false,
          properties: {
            nome: { type: 'string', minLength: 2, maxLength: 120, example: 'Ana Souza' },
            email: { type: 'string', format: 'email', example: 'ana@email.com' },
            senha: {
              type: 'string',
              minLength: 8,
              description: 'Mínimo 8 caracteres, com letras e números',
              example: 'SenhaForte123',
            },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string', format: 'email', example: 'ana@email.com' },
            senha: { type: 'string', example: 'SenhaForte123' },
          },
        },
        LoginResposta: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            tokenType: { type: 'string', example: 'Bearer' },
            expiresIn: { type: 'string', example: '1h' },
            expiresAt: { type: 'string', format: 'date-time' },
            usuario: ref('Usuario'),
          },
        },
        Produto: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            sku: { type: 'string', example: 'ELE-001' },
            nome: { type: 'string', example: 'Smartphone Plus' },
            categoria: { type: 'string', enum: CATEGORIAS },
            preco: { type: 'number', example: 3556.5 },
            estoque: { type: 'integer', example: 41 },
            ativo: { type: 'boolean', example: true },
            criadoEm: { type: 'string', format: 'date-time' },
          },
        },
        ProdutoInput: {
          type: 'object',
          required: ['sku', 'nome', 'categoria', 'preco'],
          additionalProperties: false,
          properties: {
            sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{3,6}$', example: 'CEL-999' },
            nome: { type: 'string', example: 'Smartphone Teste' },
            categoria: { type: 'string', enum: CATEGORIAS, example: 'eletronicos' },
            preco: { type: 'number', exclusiveMinimum: true, minimum: 0, example: 1999.9 },
            estoque: { type: 'integer', minimum: 0, default: 0, example: 10 },
            ativo: { type: 'boolean', default: true },
          },
        },
        Meta: {
          type: 'object',
          properties: {
            totalItems: { type: 'integer', example: 150 },
            itemsPerPage: { type: 'integer', example: 10 },
            currentPage: { type: 'integer', example: 1 },
            totalPages: { type: 'integer', example: 15 },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' },
            links: {
              type: 'object',
              properties: {
                self: { type: 'string', example: '/produtos?page=1&limit=10' },
                first: { type: 'string', example: '/produtos?page=1&limit=10' },
                prev: { type: 'string', nullable: true, example: null },
                next: { type: 'string', nullable: true, example: '/produtos?page=2&limit=10' },
                last: { type: 'string', example: '/produtos?page=15&limit=10' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Status'],
          summary: 'Verifica se a API e o banco estão respondendo',
          responses: {
            200: {
              description: 'API saudável',
              ...json({
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  versao: { type: 'string', example: '1.0.0' },
                  uptimeSegundos: { type: 'integer', example: 42 },
                },
              }),
            },
          },
        },
      },
      '/register': {
        post: {
          tags: ['Autenticação'],
          summary: 'Cadastra um usuário (perfil "comum")',
          description: 'Rota pública. A senha é salva com hash bcrypt. Não é possível enviar "perfil".',
          requestBody: { required: true, ...json(ref('RegisterInput')) },
          responses: {
            201: { description: 'Usuário criado', ...json(ref('Usuario')) },
            400: R400,
            409: erro('E-mail já cadastrado'),
            429: R429,
          },
        },
      },
      '/login': {
        post: {
          tags: ['Autenticação'],
          summary: 'Faz login e devolve um token JWT',
          requestBody: { required: true, ...json(ref('LoginInput')) },
          responses: {
            200: { description: 'Login realizado', ...json(ref('LoginResposta')) },
            400: R400,
            401: erro(
              'E-mail ou senha incorretos',
              exemploErro(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'),
            ),
            429: R429,
          },
        },
      },
      '/perfil': {
        get: {
          tags: ['Autenticação'],
          summary: 'Dados do usuário logado',
          security: seguro,
          responses: { 200: { description: 'Usuário do token', ...json(ref('Usuario')) }, 401: R401 },
        },
      },
      '/usuarios': {
        get: {
          tags: ['Usuários'],
          summary: 'Lista usuários (admin)',
          security: seguro,
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
            { name: 'perfil', in: 'query', schema: { type: 'string', enum: PERFIS } },
          ],
          responses: {
            200: {
              description: 'Lista paginada',
              ...json({ type: 'object', properties: { data: { type: 'array', items: ref('Usuario') }, meta: ref('Meta') } }),
            },
            401: R401,
            403: R403,
          },
        },
      },
      '/usuarios/{id}': {
        get: {
          tags: ['Usuários'],
          summary: 'Busca um usuário (admin ou o próprio usuário)',
          security: seguro,
          parameters: [idParam],
          responses: { 200: { description: 'Usuário', ...json(ref('Usuario')) }, 401: R401, 403: R403, 404: R404 },
        },
        delete: {
          tags: ['Usuários'],
          summary: 'Exclui um usuário (admin)',
          description: 'Retorna 403 Forbidden se o usuário logado não tiver o perfil "admin".',
          security: seguro,
          parameters: [idParam],
          responses: {
            204: { description: 'Usuário excluído' },
            401: R401,
            403: R403,
            404: R404,
            422: erro('Admin tentando excluir a própria conta'),
          },
        },
      },
      '/usuarios/{id}/perfil': {
        patch: {
          tags: ['Usuários'],
          summary: 'Altera o perfil de um usuário (admin)',
          security: seguro,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({ type: 'object', required: ['perfil'], properties: { perfil: { type: 'string', enum: PERFIS } } }),
          },
          responses: { 200: { description: 'Perfil alterado', ...json(ref('Usuario')) }, 400: R400, 401: R401, 403: R403, 404: R404 },
        },
      },
      '/produtos': {
        get: {
          tags: ['Produtos'],
          summary: 'Lista produtos com paginação, filtros e ordenação (pública)',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: CAMPOS_ORDENACAO, default: 'id' } },
            { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
            { name: 'categoria', in: 'query', schema: { type: 'string', enum: CATEGORIAS } },
            { name: 'ativo', in: 'query', schema: { type: 'boolean' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'minPrice', in: 'query', schema: { type: 'number', minimum: 0 } },
            { name: 'maxPrice', in: 'query', schema: { type: 'number', minimum: 0 } },
          ],
          responses: {
            200: {
              description: 'Página de produtos',
              ...json({ type: 'object', properties: { data: { type: 'array', items: ref('Produto') }, meta: ref('Meta') } }),
            },
            400: R400,
          },
        },
        post: {
          tags: ['Produtos'],
          summary: 'Cadastra um produto (admin)',
          security: seguro,
          requestBody: { required: true, ...json(ref('ProdutoInput')) },
          responses: {
            201: { description: 'Produto criado', ...json(ref('Produto')) },
            400: R400,
            401: R401,
            403: R403,
            409: erro('SKU já cadastrado'),
          },
        },
      },
      '/produtos/{id}': {
        get: {
          tags: ['Produtos'],
          summary: 'Busca um produto (pública)',
          parameters: [idParam],
          responses: { 200: { description: 'Produto', ...json(ref('Produto')) }, 404: R404 },
        },
        put: {
          tags: ['Produtos'],
          summary: 'Substitui todos os dados de um produto (admin)',
          security: seguro,
          parameters: [idParam],
          requestBody: { required: true, ...json(ref('ProdutoInput')) },
          responses: {
            200: { description: 'Produto atualizado', ...json(ref('Produto')) },
            400: R400,
            401: R401,
            403: R403,
            404: R404,
            409: erro('SKU já usado por outro produto'),
          },
        },
        patch: {
          tags: ['Produtos'],
          summary: 'Atualiza só os campos enviados (admin)',
          security: seguro,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({
              type: 'object',
              minProperties: 1,
              additionalProperties: false,
              properties: {
                sku: { type: 'string' },
                nome: { type: 'string' },
                categoria: { type: 'string', enum: CATEGORIAS },
                preco: { type: 'number', example: 1799.9 },
                estoque: { type: 'integer', example: 20 },
                ativo: { type: 'boolean' },
              },
            }),
          },
          responses: {
            200: { description: 'Produto atualizado', ...json(ref('Produto')) },
            400: R400,
            401: R401,
            403: R403,
            404: R404,
            409: erro('SKU já usado por outro produto'),
          },
        },
        delete: {
          tags: ['Produtos'],
          summary: 'Exclui um produto (admin)',
          security: seguro,
          parameters: [idParam],
          responses: { 204: { description: 'Produto excluído' }, 401: R401, 403: R403, 404: R404 },
        },
      },
      '/produtos/{id}/baixa-estoque': {
        post: {
          tags: ['Produtos'],
          summary: 'Compra: dá baixa no estoque (usuário logado)',
          security: seguro,
          parameters: [idParam],
          requestBody: {
            required: true,
            ...json({ type: 'object', required: ['quantidade'], properties: { quantidade: { type: 'integer', minimum: 1, example: 1 } } }),
          },
          responses: {
            200: { description: 'Estoque atualizado', ...json(ref('Produto')) },
            400: R400,
            401: R401,
            404: R404,
            422: erro('Estoque insuficiente ou produto inativo'),
          },
        },
      },
    },
  };
}

module.exports = { criarOpenApi };
