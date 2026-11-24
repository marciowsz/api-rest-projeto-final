/**
 * Banco de dados SQLite (módulo nativo node:sqlite, sem dependências).
 * Por padrão roda em memória; defina DB_FILE para gravar em arquivo.
 */
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT    NOT NULL,                    -- hash bcrypt, nunca a senha
    perfil     TEXT    NOT NULL DEFAULT 'comum' CHECK (perfil IN ('comum', 'admin')),
    criado_em  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    sku       TEXT    NOT NULL UNIQUE,
    nome      TEXT    NOT NULL,
    categoria TEXT    NOT NULL,
    preco     REAL    NOT NULL CHECK (preco > 0),
    estoque   INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
    ativo     INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Índices para os filtros e ordenações mais usados na listagem
  CREATE INDEX IF NOT EXISTS idx_produtos_categoria_preco ON produtos (categoria, preco);
  CREATE INDEX IF NOT EXISTS idx_produtos_preco ON produtos (preco);
`;

function createDatabase(file = process.env.DB_FILE || ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDatabase };
