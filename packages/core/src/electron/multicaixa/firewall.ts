/**
 * Liberação da porta no Firewall do Windows.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * Quando um programa começa a escutar numa porta, o Windows bloqueia e mostra
 * aquela caixa de "permitir acesso". Se o lojista clicar em "Cancelar" — e ele
 * clica, porque a caixa aparece do nada falando de rede —, o segundo caixa
 * simplesmente não conecta, sem nenhuma mensagem que explique o motivo. O
 * sintoma vira "não funciona", e o diagnóstico à distância é dolorido.
 *
 * Então o app cria a regra por conta própria, com o lojista sabendo o que está
 * acontecendo, em vez de deixá-lo adivinhar numa caixa de diálogo do sistema.
 *
 * ── Sobre pedir elevação ─────────────────────────────────────────────────────
 * Criar regra de firewall exige administrador. Isso NÃO é feito no boot nem
 * escondido: só quando o lojista liga o multi-caixa e clica em liberar. Pedir
 * elevação sem que a pessoa tenha pedido nada é comportamento de programa
 * suspeito, e o Windows trata como tal.
 *
 * ── Sobre montar linha de comando ────────────────────────────────────────────
 * O caminho do programa entra na regra e vem do sistema, mas mesmo assim os
 * argumentos são passados como LISTA, nunca concatenados numa string de shell.
 * Uma pasta com aspas ou `&` no nome viraria execução de comando arbitrário —
 * e "Área de Trabalho\Loja & Cia" é nome plausível de pasta.
 */

export const NOME_REGRA = 'FHVP Tech - Multi-caixa'

/** Executa um programa e devolve saída e código. Injetado para poder testar. */
export interface ExecutorComando {
  (programa: string, argumentos: string[]): Promise<{ codigo: number; saida: string }>
}

/** Argumentos do `netsh` que conferem se a regra já existe. */
export function argumentosConsulta(): string[] {
  return ['advfirewall', 'firewall', 'show', 'rule', `name=${NOME_REGRA}`]
}

/**
 * Argumentos do `netsh` que criam a regra.
 *
 * Escopo deliberadamente estreito: só entrada, só TCP, só esta porta, só este
 * executável, e só nos perfis privado e de domínio — a rede da loja. O perfil
 * público (Wi-Fi de aeroporto, cafeteria) fica de fora de propósito: se o PC
 * for um notebook que sai por aí, ninguém consegue alcançá-lo.
 */
export function argumentosCriacao(porta: number, caminhoPrograma: string): string[] {
  if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) {
    throw new Error(`Porta inválida para regra de firewall: ${porta}`)
  }
  return [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${NOME_REGRA}`,
    'dir=in',
    'action=allow',
    'protocol=TCP',
    `localport=${porta}`,
    `program=${caminhoPrograma}`,
    'profile=private,domain',
    'enable=yes'
  ]
}

export function argumentosRemocao(): string[] {
  return ['advfirewall', 'firewall', 'delete', 'rule', `name=${NOME_REGRA}`]
}

/**
 * Monta a chamada elevada que cria a regra.
 *
 * Criar regra de firewall exige administrador, e um programa não pode elevar a
 * si mesmo — precisa pedir ao Windows, que mostra a caixa do escudo. O caminho
 * é o `Start-Process -Verb RunAs` do PowerShell.
 *
 * ── O cuidado que justifica esta função existir ──────────────────────────────
 * Os argumentos viram TEXTO dentro de um comando do PowerShell, e um deles é o
 * caminho do executável. Uma pasta chamada `Loja d'Ana` fecharia a aspa e
 * transformaria o resto em comando — executado como ADMINISTRADOR. Por isso
 * cada argumento vai entre aspas simples com as aspas internas duplicadas, que
 * é o escape correto do PowerShell, e há teste fixando isso.
 */
export function comandoElevado(argumentos: readonly string[]): {
  programa: string
  argumentos: string[]
} {
  const lista = argumentos.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')
  return {
    programa: 'powershell',
    argumentos: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process netsh -ArgumentList ${lista} -Verb RunAs -WindowStyle Hidden -Wait`
    ]
  }
}

export type EstadoFirewall = 'liberado' | 'bloqueado' | 'indeterminado'

/**
 * Descobre se a porta já está liberada.
 *
 * `indeterminado` é resposta legítima e importante: em máquina que não é
 * Windows, ou com o `netsh` indisponível, é melhor dizer "não sei" do que
 * afirmar "bloqueado" e mandar o lojista caçar problema que talvez não exista.
 */
export async function consultarRegra(executar: ExecutorComando): Promise<EstadoFirewall> {
  if (process.platform !== 'win32') return 'indeterminado'
  try {
    const { codigo, saida } = await executar('netsh', argumentosConsulta())
    if (codigo === 0 && saida.includes(NOME_REGRA)) return 'liberado'
    return 'bloqueado'
  } catch {
    return 'indeterminado'
  }
}
