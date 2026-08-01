/**
 * Clonagem do banco de uma máquina para outra, pela rede.
 *
 * ── O problema que resolve ───────────────────────────────────────────────────
 * Hoje, levar os dados para outro computador é: gerar backup na origem → copiar
 * o arquivo para um pen drive → colar na pasta certa do destino → restaurar.
 * Quatro passos manuais, e o terceiro é o que dá errado — pasta errada, arquivo
 * pela metade, versão trocada. Aqui a rede substitui o pen drive; o resto do
 * caminho é o mesmo código de backup e restauração que já roda hoje.
 *
 * ── Para que serve, e para que NÃO serve ─────────────────────────────────────
 * Serve para instalar num computador novo, trocar o PC da loja, e para o caso
 * que hoje não tem solução prática: **o PC quebrou e o notebook precisa
 * assumir**.
 *
 * NÃO serve como preparação para o multi-caixa, e isso é importante: o caixa
 * adicional lê os dados AO VIVO do computador principal e não guarda cópia
 * nenhuma. Clonar antes de conectar não ajudaria — no instante seguinte à
 * cópia, a origem faz uma venda e a cópia já está velha. São duas coisas
 * independentes.
 *
 * ── Por que a versão trava ───────────────────────────────────────────────────
 * O banco vem no formato da origem. Migração de banco anda só para frente: um
 * app antigo não sabe ler um banco novo, e tentar deixaria o destino com um
 * banco que ele não entende — pior que não ter clonado. Então versão do destino
 * mais antiga que a da origem é recusada, com a mensagem dizendo o que fazer.
 */

/** Compara versões "1.31.1". Devolve -1, 0 ou 1. */
export function compararVersoes(a: string, b: string): number {
  const partes = (v: string): number[] =>
    String(v ?? '')
      .trim()
      .split('.')
      .map((p) => {
        const n = Number.parseInt(p, 10)
        return Number.isFinite(n) ? n : 0
      })

  const pa = partes(a)
  const pb = partes(b)
  const total = Math.max(pa.length, pb.length)
  for (let i = 0; i < total; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db ? -1 : 1
  }
  return 0
}

export type MotivoRecusaClonagem =
  | 'sem-codigo'
  | 'codigo-errado'
  | 'codigo-expirado'
  | 'versao-antiga'

export type ResultadoClonagem =
  | { ok: true; zip: Buffer; nomeArquivo: string }
  | { ok: false; motivo: MotivoRecusaClonagem; detalhe?: string }

/**
 * O destino consegue ler um banco vindo desta origem?
 *
 * Igual passa: mesma versão, mesmo formato. Destino mais NOVO passa, porque as
 * migrações dele levam o banco para frente. Destino mais ANTIGO não passa.
 */
export function destinoConsegueLer(versaoOrigem: string, versaoDestino: string): boolean {
  return compararVersoes(versaoDestino, versaoOrigem) >= 0
}

/**
 * Aceita o endereço do jeito que o lojista digita.
 *
 * Ninguém escreve `http://192.168.0.10:4877`. As pessoas copiam o que veem na
 * tela do outro computador — às vezes só o número, às vezes com a porta junto,
 * às vezes com espaço no fim. Recusar por causa disso transformaria a operação
 * em tentativa e erro.
 */
export function normalizarEndereco(bruto: string, portaPadrao: number): string {
  const texto = String(bruto ?? '').trim()
  if (!texto) throw new Error('Informe o endereço do computador de origem.')
  const comEsquema = /^https?:\/\//i.test(texto) ? texto : `http://${texto}`
  let url: URL
  try {
    url = new URL(comEsquema)
  } catch {
    throw new Error('Endereço inválido. Confira o que aparece na tela do outro computador.')
  }
  if (!url.hostname) {
    throw new Error('Endereço inválido. Confira o que aparece na tela do outro computador.')
  }
  if (!url.port) url.port = String(portaPadrao)
  return `${url.protocol}//${url.host}`
}

export const RECUSA_CLONAGEM: Record<MotivoRecusaClonagem, string> = {
  'sem-codigo': 'Nenhuma cópia autorizada. Gere um código no computador de origem.',
  'codigo-errado': 'Código incorreto.',
  'codigo-expirado': 'O código expirou. Gere outro no computador de origem.',
  'versao-antiga':
    'Este computador tem uma versão mais antiga do sistema. Atualize-o antes de trazer os dados.'
}
