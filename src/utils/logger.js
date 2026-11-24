/**
 * Log interno do servidor (bônus da Semana 5).
 *
 * Erros 500 são gravados com stack trace completo em logs/errors.log e no
 * console (stderr), para a equipe de infraestrutura investigar.
 * O usuário final NUNCA recebe esses detalhes.
 */
const fs = require('node:fs');
const path = require('node:path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

function error(message, meta = {}) {
  const entry = { level: 'error', timestamp: new Date().toISOString(), message, ...meta };
  const line = JSON.stringify(entry);

  if (process.env.NODE_ENV !== 'test') console.error(line);

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Falha ao gravar o log nunca pode derrubar a API.
  }
}

module.exports = { error, LOG_FILE };
