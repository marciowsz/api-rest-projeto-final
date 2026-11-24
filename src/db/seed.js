/**
 * Popula o banco com 150 produtos (determinístico: sempre os mesmos dados),
 * para testar paginação, filtros e ordenação com volume realista.
 */
const CATALOGO = {
  eletronicos: { sku: 'ELE', nomes: ['Smartphone', 'Notebook', 'Fone Bluetooth', 'Smartwatch', 'Tablet', 'Monitor'], faixa: [150, 6000] },
  vestuario: { sku: 'VES', nomes: ['Camiseta', 'Calça Jeans', 'Jaqueta', 'Tênis', 'Boné', 'Moletom'], faixa: [30, 450] },
  casa: { sku: 'CAS', nomes: ['Cafeteira', 'Liquidificador', 'Jogo de Panelas', 'Luminária', 'Ventilador', 'Aspirador'], faixa: [60, 1200] },
  livros: { sku: 'LIV', nomes: ['Clean Code', 'Domain-Driven Design', 'Refactoring', 'O Programador Pragmático', 'Algoritmos', 'Arquitetura Limpa'], faixa: [40, 250] },
  esportes: { sku: 'ESP', nomes: ['Bola de Futebol', 'Bicicleta', 'Halteres', 'Esteira', 'Raquete', 'Garrafa Térmica'], faixa: [25, 3500] },
};

const MODELOS = ['Basic', 'Plus', 'Pro', 'Max', 'Lite'];

function seedProdutos(db, total = 150) {
  const { quantidade } = db.prepare('SELECT COUNT(*) AS quantidade FROM produtos').get();
  if (quantidade > 0) return 0;

  // Gerador pseudoaleatório com semente fixa (mesmos dados em toda execução)
  let semente = 42;
  const aleatorio = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };

  const categorias = Object.keys(CATALOGO);
  const insert = db.prepare(
    `INSERT INTO produtos (sku, nome, categoria, preco, estoque, ativo, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const base = Date.parse('2026-01-01T08:00:00Z');

  db.exec('BEGIN');
  for (let i = 1; i <= total; i += 1) {
    const categoria = categorias[(i - 1) % categorias.length];
    const { sku, nomes, faixa } = CATALOGO[categoria];
    const nome = `${nomes[Math.floor(i / categorias.length) % nomes.length]} ${MODELOS[i % MODELOS.length]}`;
    const preco = Math.round((faixa[0] + aleatorio() * (faixa[1] - faixa[0])) * 100) / 100;
    const estoque = Math.floor(aleatorio() * 80);
    const ativo = i % 7 === 0 ? 0 : 1; // alguns produtos desativados
    const criadoEm = new Date(base + i * 3_600_000).toISOString();
    insert.run(`${sku}-${String(i).padStart(3, '0')}`, nome, categoria, preco, estoque, ativo, criadoEm);
  }
  db.exec('COMMIT');
  return total;
}

module.exports = { seedProdutos };
