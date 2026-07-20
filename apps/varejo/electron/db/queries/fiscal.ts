import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Consultas de apoio da NFC-e. Aqui mora só o diagnóstico "a loja está pronta
// pra emitir?" — a emissão em si é da Fase 2 e vive no backend.
//
// A ideia do diagnóstico é simples: o lojista precisa descobrir o que falta
// SENTADO, com calma, e não com o cliente esperando no balcão. Por isso cada
// item é verificável de graça, sem chamar a API.

export type ProdutoSemClassificacao = {
  id: number
  nome: string
  codigo_barras: string | null
}

export type DiagnosticoFiscal = {
  total_produtos: number
  produtos_sem_ncm: number
  // Amostra pra tela não travar quando forem centenas.
  exemplos_sem_ncm: ProdutoSemClassificacao[]
}

export function diagnosticoFiscal(limiteExemplos = 20): DiagnosticoFiscal {
  const db = obterBancoDeDados()

  const total = db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }

  // Só conta produto que pode ser vendido: NCM em branco é o que trava a nota.
  const semNcm = db
    .prepare(`SELECT COUNT(*) AS n FROM produtos WHERE ncm IS NULL OR TRIM(ncm) = ''`)
    .get() as { n: number }

  const exemplos = db
    .prepare(
      `SELECT id, nome, codigo_barras FROM produtos
       WHERE ncm IS NULL OR TRIM(ncm) = ''
       ORDER BY nome LIMIT ?`
    )
    .all(limiteExemplos) as ProdutoSemClassificacao[]

  return {
    total_produtos: total.n,
    produtos_sem_ncm: semNcm.n,
    exemplos_sem_ncm: exemplos
  }
}
