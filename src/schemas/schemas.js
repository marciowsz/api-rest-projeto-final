/**
 * Schemas de validação (Zod) - o "contrato" de entrada da API.
 */
const { z } = require('zod');

const CATEGORIAS = ['eletronicos', 'vestuario', 'casa', 'livros', 'esportes'];

const idParamSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'O id deve ser um número.' })
    .int('O id deve ser um número inteiro.')
    .positive('O id deve ser maior que 0.'),
});

const PERFIS = ['comum', 'admin'];

const emailSchema = z
  .string({ required_error: 'O e-mail é obrigatório.', invalid_type_error: 'O e-mail deve ser um texto.' })
  .trim()
  .toLowerCase()
  .email('O formato do e-mail está incorreto.');

/** POST /register - o perfil NÃO pode ser enviado: todo registro público é "comum" */
const registerSchema = z
  .object({
    nome: z
      .string({ required_error: 'O nome é obrigatório.', invalid_type_error: 'O nome deve ser um texto.' })
      .trim()
      .min(2, 'O nome deve ter pelo menos 2 caracteres.')
      .max(120, 'O nome deve ter no máximo 120 caracteres.'),
    email: emailSchema,
    senha: z
      .string({ required_error: 'A senha é obrigatória.', invalid_type_error: 'A senha deve ser um texto.' })
      .min(8, 'A senha deve ter pelo menos 8 caracteres.')
      // o bcrypt só considera os primeiros 72 bytes
      .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'A senha deve ter no máximo 72 bytes.')
      .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), 'A senha deve conter letras e números.'),
  })
  .strict();

/** POST /login */
const loginSchema = z
  .object({
    email: emailSchema,
    senha: z.string({ required_error: 'A senha é obrigatória.' }).min(1, 'A senha é obrigatória.'),
  })
  .strict();

/** PATCH /usuarios/:id/perfil (somente admin) */
const alterarPerfilSchema = z
  .object({
    perfil: z.enum(PERFIS, {
      errorMap: () => ({ message: `O perfil deve ser um destes: ${PERFIS.join(', ')}.` }),
    }),
  })
  .strict();

/** Campos de produto, sem valores padrão (base para POST, PUT e PATCH) */
const produtoCampos = z.object({
  sku: z
    .string({ required_error: 'O SKU é obrigatório.' })
    .trim()
    .regex(/^[A-Z]{3}-\d{3,6}$/, 'O SKU deve seguir o formato AAA-000 (ex.: CEL-001).'),
  nome: z
    .string({ required_error: 'O nome é obrigatório.' })
    .trim()
    .min(2, 'O nome deve ter pelo menos 2 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  categoria: z.enum(CATEGORIAS, {
    errorMap: (issue, ctx) => ({
      message:
        ctx.data === undefined
          ? 'A categoria é obrigatória.'
          : `A categoria deve ser uma destas: ${CATEGORIAS.join(', ')}.`,
    }),
  }),
  preco: z
    .number({ required_error: 'O preço é obrigatório.', invalid_type_error: 'O preço deve ser um número.' })
    .positive('O preço deve ser maior que 0.')
    .max(1_000_000, 'O preço deve ser no máximo 1.000.000.'),
  estoque: z
    .number({ invalid_type_error: 'O estoque deve ser um número.' })
    .int('O estoque deve ser um número inteiro.')
    .min(0, 'O estoque não pode ser negativo.'),
  ativo: z.boolean({ invalid_type_error: 'O campo ativo deve ser true ou false.' }),
});

/** POST /produtos e PUT /produtos/:id - todos os campos (estoque e ativo têm padrão) */
const produtoSchema = produtoCampos
  .extend({
    estoque: produtoCampos.shape.estoque.default(0),
    ativo: produtoCampos.shape.ativo.default(true),
  })
  .strict();

/** PATCH /produtos/:id - só os campos enviados (sem aplicar valores padrão) */
const produtoPatchSchema = produtoCampos
  .partial()
  .strict()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Envie pelo menos um campo para atualizar.',
    path: ['body'],
  });

const baixaEstoqueSchema = z
  .object({
    quantidade: z
      .number({ required_error: 'A quantidade é obrigatória.', invalid_type_error: 'A quantidade deve ser um número.' })
      .int('A quantidade deve ser um número inteiro.')
      .positive('A quantidade deve ser maior que 0.'),
  })
  .strict();

/**
 * Query params de GET /produtos (paginação, ordenação e filtros).
 * Chegam sempre como texto na URL; o z.coerce converte para número.
 */
const LIMIT_MAXIMO = 100;
const CAMPOS_ORDENACAO = ['id', 'nome', 'preco', 'estoque', 'criadoEm'];

const inteiro = (campo, minimo) =>
  z.coerce
    .number({ invalid_type_error: `O parâmetro ${campo} deve ser um número.` })
    .int(`O parâmetro ${campo} deve ser um número inteiro.`)
    .min(minimo, `O parâmetro ${campo} deve ser maior ou igual a ${minimo}.`);

const preco = (campo) =>
  z.coerce
    .number({ invalid_type_error: `O parâmetro ${campo} deve ser um número.` })
    .min(0, `O parâmetro ${campo} não pode ser negativo.`);

const listarProdutosQuerySchema = z
  .object({
    // Paginação
    page: inteiro('page', 1).default(1),
    limit: inteiro('limit', 1)
      .default(10)
      // Proteção: ?limit=9999999 não derruba o banco; é forçado para 100.
      .transform((valor) => Math.min(valor, LIMIT_MAXIMO)),

    // Ordenação (lista fechada: o nome da coluna nunca vem direto da URL para o SQL)
    sort: z
      .enum(CAMPOS_ORDENACAO, {
        errorMap: () => ({ message: `O parâmetro sort deve ser um destes: ${CAMPOS_ORDENACAO.join(', ')}.` }),
      })
      .default('id'),
    order: z
      .enum(['asc', 'desc'], { errorMap: () => ({ message: 'O parâmetro order deve ser asc ou desc.' }) })
      .default('asc'),

    // Filtros
    categoria: z
      .enum(CATEGORIAS, {
        errorMap: () => ({ message: `O parâmetro categoria deve ser um destes: ${CATEGORIAS.join(', ')}.` }),
      })
      .optional(),
    ativo: z
      .enum(['true', 'false'], { errorMap: () => ({ message: 'O parâmetro ativo deve ser true ou false.' }) })
      .transform((valor) => valor === 'true')
      .optional(),
    search: z.string().trim().min(1, 'O parâmetro search não pode ser vazio.').max(100).optional(),

    // Filtro de intervalo (range)
    minPrice: preco('minPrice').optional(),
    maxPrice: preco('maxPrice').optional(),
  })
  .strict()
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'O parâmetro maxPrice deve ser maior ou igual a minPrice.',
    path: ['maxPrice'],
  });

/** GET /usuarios (somente admin) - paginação simples */
const listarUsuariosQuerySchema = z
  .object({
    page: inteiro('page', 1).default(1),
    limit: inteiro('limit', 1)
      .default(10)
      .transform((valor) => Math.min(valor, LIMIT_MAXIMO)),
    perfil: z
      .enum(PERFIS, { errorMap: () => ({ message: `O parâmetro perfil deve ser um destes: ${PERFIS.join(', ')}.` }) })
      .optional(),
  })
  .strict();

module.exports = {
  CATEGORIAS,
  PERFIS,
  LIMIT_MAXIMO,
  CAMPOS_ORDENACAO,
  idParamSchema,
  registerSchema,
  loginSchema,
  alterarPerfilSchema,
  listarUsuariosQuerySchema,
  produtoSchema,
  produtoPatchSchema,
  baixaEstoqueSchema,
  listarProdutosQuerySchema,
};
