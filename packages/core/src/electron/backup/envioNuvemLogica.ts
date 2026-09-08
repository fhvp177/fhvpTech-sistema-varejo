/**
 * A decisão de QUAIS backups ainda faltam subir — sem tocar disco nem rede.
 *
 * ── Por que a fila é derivada, e não uma lista de tarefas ───────────────────
 * O jeito óbvio seria empurrar cada zip novo para uma fila e ir tirando. O
 * problema aparece no dia em que o computador é desligado no meio: a tarefa
 * some da fila sem ter subido, e aquele dia fica sem backup na nuvem para
 * sempre — em silêncio, que é o pior jeito de faltar backup.
 *
 * Aqui é ao contrário: guarda-se o que JÁ subiu, e a fila é o que sobra. Um
 * envio interrompido simplesmente continua faltando, e a varredura seguinte o
 * pega sem nenhum código de repetição.
 *
 * ── ⚠️ O que este módulo NÃO faz ───────────────────────────────────────────
 * Não lê arquivo, não chama rede, não conhece licença. Recebe as listas prontas
 * e devolve a decisão. É o que permite testar a parte que decide sem simular
 * disco, servidor e relógio ao mesmo tempo.
 */

/** Quantos nomes de enviados a memória guarda. Além disso, os mais antigos saem. */
export const MAXIMO_LEMBRADOS = 500

/**
 * Quantos arquivos podem subir de uma vez.
 *
 * ⚠️ Existe para a PRIMEIRA vez, que é o caso perigoso: uma loja que liga o
 * recurso hoje tem quatorze zips guardados, e mandar todos de uma vez ocuparia
 * a internet dela numa tarde de movimento. Aos poucos, ela alcança o mesmo
 * lugar sem que ninguém perceba a subida.
 */
export const MAXIMO_POR_CICLO = 3

export type ArquivoLocal = {
  /** Nome do arquivo, sem caminho. É ele que vira o nome do objeto na nuvem. */
  nome: string
  /** Caminho completo, para quem for ler o conteúdo depois. */
  caminho: string
  tamanhoBytes: number
  /** Quando foi criado, em milissegundos. Decide a ordem de envio. */
  quandoMs: number
}

/**
 * O nome do arquivo é aceitável para virar objeto na nuvem?
 *
 * ⚠️ A mesma regra do servidor, escrita aqui de novo de propósito. Deixar o app
 * mandar qualquer nome e descobrir a recusa só no servidor gastaria uma ida de
 * rede por arquivo problemático — e a recusa chegaria como "400" sem contexto,
 * dias depois, no log de alguém.
 *
 * Os dois lados conferem, e o do servidor é o que vale: ele não pode confiar
 * em quem chama, porque quem chama pode não ser este código.
 */
export function nomeAceitavel(nome: string): boolean {
  if (nome.length < 5 || nome.length > 120) return false
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) return false
  if (nome.includes('..')) return false
  return nome.toLowerCase().endsWith('.zip')
}

/**
 * O que falta subir, do mais ANTIGO para o mais novo.
 *
 * A ordem importa e é contraintuitiva: o instinto manda subir primeiro o mais
 * recente, que é o mais valioso. Mas quem está atrás na fila é justamente quem
 * teve um envio interrompido, e inverter a ordem faria esse arquivo ficar para
 * trás toda vez que um backup novo aparecesse — nunca subindo.
 */
export function pendentes(
  locais: ArquivoLocal[],
  jaEnviados: string[],
  maximoPorCiclo = MAXIMO_POR_CICLO
): ArquivoLocal[] {
  const enviados = new Set(jaEnviados)
  return locais
    .filter((a) => nomeAceitavel(a.nome) && !enviados.has(a.nome))
    .sort((a, b) => a.quandoMs - b.quandoMs)
    .slice(0, maximoPorCiclo)
}

/**
 * A memória do que já subiu, depois de anotar mais um.
 *
 * Corta pelos MAIS ANTIGOS quando passa do teto: se um nome esquecido voltar a
 * aparecer no disco, ele sobe de novo — desperdício pequeno. Esquecer um nome
 * recente causaria o mesmo reenvio toda semana, para sempre.
 */
export function registrarEnviado(jaEnviados: string[], nome: string): string[] {
  if (jaEnviados.includes(nome)) return jaEnviados
  const lista = [...jaEnviados, nome]
  return lista.length <= MAXIMO_LEMBRADOS ? lista : lista.slice(lista.length - MAXIMO_LEMBRADOS)
}
