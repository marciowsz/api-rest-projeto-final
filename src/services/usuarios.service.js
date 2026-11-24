/**
 * Usuários e autenticação: cadastro com hash bcrypt, login com JWT e
 * operações administrativas. A senha (nem o hash) NUNCA sai deste arquivo.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  NotFoundError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  SelfDeleteError,
} = require('../errors/AppError');

function usuariosService(db, { jwtSecret, jwtExpiresIn, bcryptRounds }) {
  /** Única função que transforma linha do banco em resposta: sem senha_hash */
  const toUsuario = (row) => ({
    id: row.id,
    nome: row.nome,
    email: row.email,
    perfil: row.perfil,
    criadoEm: row.criado_em,
  });

  // Hash "falso" usado quando o e-mail não existe, para o login levar o mesmo
  // tempo nos dois casos (evita descobrir e-mails cadastrados pelo tempo de resposta).
  const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe-1', bcryptRounds);

  return {
    /** POST /register - sempre perfil "comum" */
    async registrar({ nome, email, senha }, perfil = 'comum') {
      if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
        throw new UserAlreadyExistsError(email);
      }
      // Hash de mão única com salt aleatório embutido (ex.: $2a$10$...)
      const senhaHash = await bcrypt.hash(senha, bcryptRounds);
      const { lastInsertRowid } = db
        .prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)')
        .run(nome, email, senhaHash, perfil);
      return this.buscarPorId(Number(lastInsertRowid));
    },

    /** POST /login - compara o hash e devolve um JWT com id e perfil */
    async login({ email, senha }) {
      const row = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
      const senhaConfere = await bcrypt.compare(senha, row ? row.senha_hash : HASH_FALSO);
      if (!row || !senhaConfere) throw new InvalidCredentialsError();

      const token = jwt.sign({ perfil: row.perfil }, jwtSecret, {
        subject: String(row.id),
        expiresIn: jwtExpiresIn,
        algorithm: 'HS256',
      });
      const { exp } = jwt.decode(token);

      return {
        token,
        tokenType: 'Bearer',
        expiresIn: jwtExpiresIn,
        expiresAt: new Date(exp * 1000).toISOString(),
        usuario: toUsuario(row),
      };
    },

    buscarPorId(id) {
      const row = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
      if (!row) throw new NotFoundError('Usuário', id);
      return toUsuario(row);
    },

    listar({ page, limit, perfil }) {
      const where = perfil ? 'WHERE perfil = ?' : '';
      const valores = perfil ? [perfil] : [];
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM usuarios ${where}`).get(...valores);
      const rows = db
        .prepare(`SELECT * FROM usuarios ${where} ORDER BY id LIMIT ? OFFSET ?`)
        .all(...valores, limit, (page - 1) * limit);
      return { data: rows.map(toUsuario), totalItems: total };
    },

    alterarPerfil(id, perfil) {
      this.buscarPorId(id);
      db.prepare('UPDATE usuarios SET perfil = ? WHERE id = ?').run(perfil, id);
      return this.buscarPorId(id);
    },

    excluir(id, idDoAdmin) {
      if (id === idDoAdmin) throw new SelfDeleteError();
      this.buscarPorId(id);
      db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    },

    /** Cria o primeiro administrador a partir do .env (se ainda não existir) */
    async garantirAdmin({ nome, email, senha }) {
      if (!email || !senha) return null;
      const existente = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());
      if (existente) return toUsuario(existente);
      return this.registrar({ nome, email: email.toLowerCase(), senha }, 'admin');
    },
  };
}

module.exports = { usuariosService };
