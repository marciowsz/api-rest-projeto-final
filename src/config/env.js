/**
 * Configurações lidas do ambiente (.env).
 * Segredos NUNCA ficam no código: o JWT_SECRET vem do arquivo .env
 * (que está no .gitignore) ou das variáveis do servidor em produção.
 */
require('dotenv').config({ quiet: true });

function carregarConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET ausente ou curto demais (mínimo 32 caracteres). Copie .env.example para .env e defina um segredo.',
    );
  }

  return {
    port: Number(env.PORT) || 3000,
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '1h',
    bcryptRounds: Number(env.BCRYPT_ROUNDS) || 10,
    authRateLimit: Number(env.AUTH_RATE_LIMIT) || 20, // tentativas de login/registro por IP a cada 15 min
    corsOrigin: env.CORS_ORIGIN || '*',
    trustProxy: env.NODE_ENV === 'production',
    admin: {
      nome: env.ADMIN_NOME || 'Administrador',
      email: env.ADMIN_EMAIL,
      senha: env.ADMIN_SENHA,
    },
  };
}

module.exports = { carregarConfig };
