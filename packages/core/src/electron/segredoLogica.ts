/**
 * Guardar credencial de terceiro no PC da loja.
 *
 * ── Por que não basta gravar na tabela `config` ──────────────────────────────
 * O banco desta loja VIAJA: vai pra pen drive, pra pasta secundária, pro backup
 * antes de cada atualização, e às vezes pra mão do suporte investigar um
 * problema. Uma credencial em texto puro ali viaja junto em todas essas cópias
 * — e um token de adquirente COBRA DINHEIRO em nome do lojista. Pen drive
 * esquecido na gaveta viraria acesso à conta dele.
 *
 * A proteção é do sistema operacional (DPAPI no Windows, via safeStorage do
 * Electron): a chave é derivada da conta de usuário do Windows e fica com o
 * SO — este código nunca a vê, nunca escolhe senha, nunca tem onde errar.
 *
 * ── O que isso NÃO protege ───────────────────────────────────────────────────
 * Quem já está logado como aquele usuário naquele PC e consegue rodar código
 * consegue pedir pro SO decifrar também. O ganho real é o segredo não VAZAR PRA
 * FORA da máquina — que é justamente o caminho que os backups abrem.
 *
 * ── O preço, que é real ──────────────────────────────────────────────────────
 * Sendo amarrado à máquina e ao usuário, o segredo NÃO SOBREVIVE a uma troca de
 * PC: restaurar o backup noutra máquina traz tudo de volta, menos isto. Por
 * isso a leitura NUNCA lança: segredo ilegível é tratado igual a segredo
 * ausente ("não configurado"), e quem chama pede pra reconfigurar. Se isto
 * lançasse, uma credencial ilegível derrubaria o app inteiro no boot.
 *
 * A lógica mora aqui, separada do Electron, pra poder ser testada sem abrir uma
 * janela — mesmo arranjo de multicaixa/configLogica.ts.
 */

/** O cofre do sistema operacional. Em produção é o safeStorage do Electron. */
export type Cofre = {
  disponivel: () => boolean
  cifrar: (texto: string) => Buffer
  decifrar: (blob: Buffer) => string
}

/** Onde o texto cifrado descansa. Em produção é a tabela `config`. */
export type Deposito = {
  ler: (chave: string) => string
  gravar: (chave: string, valor: string) => void
}

// Marca de versão à frente do base64. Serve pra distinguir um valor cifrado por
// nós de qualquer outra coisa que um dia tenha sido gravada na mesma chave —
// sem ela, um texto puro antigo seria decodificado como lixo binário.
const PREFIXO = 'v1:'

export function guardarSegredoCom(
  cofre: Cofre,
  deposito: Deposito,
  chave: string,
  valor: string
): void {
  const limpo = valor.trim()
  // Apagar é caso legítimo (lojista removeu a credencial), não erro — e não
  // exige cofre disponível: some com o dado de qualquer jeito.
  if (!limpo) {
    deposito.gravar(chave, '')
    return
  }
  // Recusa explícita em vez de cair pra texto puro. Gravar sem cifrar quando o
  // cofre falta seria dar ao lojista uma sensação de proteção que não existe —
  // pior que não guardar.
  if (!cofre.disponivel()) {
    throw new Error(
      'O Windows não liberou o cofre de credenciais desta máquina. ' +
        'A credencial não foi salva — sem ele, ela ficaria desprotegida no backup.'
    )
  }
  deposito.gravar(chave, PREFIXO + cofre.cifrar(limpo).toString('base64'))
}

/**
 * Devolve o segredo, ou `null` quando não dá pra ler — ausente, cofre
 * indisponível, gravado noutra máquina, ou corrompido. Nunca lança.
 */
export function lerSegredoCom(cofre: Cofre, deposito: Deposito, chave: string): string | null {
  let bruto: string
  try {
    bruto = deposito.ler(chave)
  } catch {
    // Banco fechado/travado no meio de um boot não é motivo pra derrubar nada.
    return null
  }
  if (!bruto || !bruto.startsWith(PREFIXO)) return null

  try {
    if (!cofre.disponivel()) return null
    const aberto = cofre.decifrar(Buffer.from(bruto.slice(PREFIXO.length), 'base64'))
    return aberto || null
  } catch {
    // O caso da máquina trocada cai aqui. É esperado, não é defeito.
    return null
  }
}

/** Se existe algo gravado, mesmo que esta máquina não consiga abrir. */
export function temSegredoCom(deposito: Deposito, chave: string): boolean {
  try {
    return deposito.ler(chave).startsWith(PREFIXO)
  } catch {
    return false
  }
}
