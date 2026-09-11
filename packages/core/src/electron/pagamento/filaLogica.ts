/**
 * As regras que impedem o caixa de cobrar duas vezes do mesmo cliente.
 *
 * ── O fato que dá forma a tudo aqui ──────────────────────────────────────────
 * O DINHEIRO SAI DA MÃO DO CLIENTE ANTES DO NOSSO SISTEMA SABER.
 *
 * O cartão é aprovado na maquininha, e só depois a notícia volta pra cá. A
 * volta pode não acontecer: a internet piscou, o PC desligou, o cabo caiu. Daí
 * a única frase que interessa neste arquivo:
 *
 *     "Não recebi resposta" NÃO significa "não foi pago". Significa "não sei".
 *
 * Confundir os dois é o que faz um caixa passar o cartão de novo num cliente
 * que já pagou, e esse é o pior defeito que uma loja pode ter. Não é um erro
 * que dá pra corrigir depois com um relatório: o cliente já foi embora.
 *
 * ── Por que existe uma FILA, e não só uma chamada ────────────────────────────
 * Se cobrar fosse uma função que devolve "aprovado" ou "recusado", o estado da
 * cobrança viveria dentro de uma variável na tela. Fechar a tela, cair a luz ou
 * o app reiniciar apagaria a memória de uma cobrança que existe no mundo real,
 * do lado da adquirente, com dinheiro dentro.
 *
 * A fila é essa memória escrita no banco. Ela sobrevive ao reinício, e é por
 * ela que o sistema consegue perguntar depois "afinal, aquilo foi pago?".
 *
 * ── Isto aqui não conhece maquininha nenhuma ─────────────────────────────────
 * Nem PagBank, nem Mercado Pago, nem rede, nem banco de dados. São só as
 * regras, em funções puras, pra poderem ser testadas sem maquininha na mesa e
 * sem gastar dinheiro de verdade. Quem fala com o mundo é o `ProvedorPagamento`
 * (ver `provedor.ts`), e quem grava é a camada de banco do aplicativo.
 */
import type { MeioCobranca, SituacaoCobranca } from './provedor'

/**
 * Uma cobrança como ela descansa no banco.
 *
 * `vendaId` nasce nulo DE PROPÓSITO, e isso não é um detalhe: no balcão a
 * cobrança acontece ANTES da venda ser registrada. O operador fecha o carrinho,
 * manda cobrar, o cliente passa o cartão, e só então a venda é gravada. Existe
 * portanto uma janela em que há dinheiro cobrado e nenhuma venda no sistema.
 * Ver `cobrancasOrfas` no fim deste arquivo: é essa janela que ela vigia.
 */
export type Cobranca = {
  /**
   * O que amarra esta cobrança a uma tentativa específica do operador. Não é o
   * id da venda, porque a venda ainda não existe quando a cobrança nasce.
   * Mandar cobrar de novo com a mesma referência tem que devolver ESTA
   * cobrança, nunca criar uma segunda.
   */
  referencia: string
  /** 'pagbank', 'mercadopago'. Guardado porque a loja pode trocar de maquininha. */
  provedor: string
  /** Em reais. */
  valor: number
  meio: MeioCobranca
  /** Ausente ou 1 é à vista. Só faz sentido no crédito. */
  parcelas: number | null
  situacao: SituacaoCobranca
  /** Id da cobrança lá na adquirente. Sem ele não dá pra consultar nem cancelar. */
  idExterno: string | null
  /** Preenchido só quando a venda é gravada, depois da aprovação. */
  vendaId: number | null
}

/**
 * O que o PDV deve fazer quando o operador pede pra cobrar.
 *
 * - `cobrar`: caminho limpo, pode mandar pra maquininha.
 * - `acompanhar`: já existe uma cobrança viva; mostre ela e espere o desfecho.
 * - `consultar`: existe uma cobrança em estado desconhecido e ela PRECISA ser
 *   resolvida antes de qualquer outra coisa acontecer.
 * - `bloquear`: isto já foi pago. Cobrar de novo seria cobrar duas vezes.
 */
export type AcaoCobranca = 'cobrar' | 'acompanhar' | 'consultar' | 'bloquear'

export type Decisao = {
  acao: AcaoCobranca
  /** Texto pronto pro operador ler. A tela mostra isto, não inventa o dela. */
  motivo: string
}

/**
 * A regra do caixa, em um lugar só.
 *
 * Recebe a última cobrança desta tentativa de venda (ou `null`, quando não há
 * nenhuma) e diz o que pode acontecer agora.
 *
 * ── Por que 'desconhecido' não deixa cobrar ──────────────────────────────────
 * É o estado que existe justamente porque a resposta se perdeu. A cobrança pode
 * estar aprovada lá na adquirente. Mandar outra por cima seria a definição de
 * cobrar duas vezes, e o operador não teria como saber. A saída é consultar,
 * que é a única forma honesta de descobrir o que de fato aconteceu.
 *
 * ── Por que 'recusada' deixa ─────────────────────────────────────────────────
 * Cartão negado é o caso mais comum do balcão: o cliente tira outro cartão da
 * carteira. Aí é uma cobrança NOVA, com referência nova, não um reaproveitamento
 * da anterior. A recusada fica no histórico, que é onde ela é útil.
 */
export function decidirCobranca(ultima: Cobranca | null): Decisao {
  if (!ultima) {
    return { acao: 'cobrar', motivo: '' }
  }

  switch (ultima.situacao) {
    case 'aprovada':
      return {
        acao: 'bloquear',
        motivo:
          'Esta venda já foi paga no cartão. Cobrar de novo passaria o valor ' +
          'duas vezes no cliente.'
      }

    case 'desconhecido':
      return {
        acao: 'consultar',
        motivo:
          'A resposta da maquininha se perdeu, então o sistema não sabe se o ' +
          'cliente pagou. Confira o resultado antes de cobrar de novo.'
      }

    case 'aguardando':
      return {
        acao: 'acompanhar',
        motivo: 'Já existe uma cobrança em andamento na maquininha para esta venda.'
      }

    case 'recusada':
    case 'cancelada':
      return { acao: 'cobrar', motivo: '' }
  }
}

/**
 * Aplica na cobrança guardada uma notícia que chegou da adquirente.
 *
 * ── A assimetria que manda aqui ──────────────────────────────────────────────
 * As duas maneiras de errar não custam a mesma coisa:
 *
 *   Achar que foi pago quando não foi  → a loja entrega sem receber. Ruim, e
 *                                        aparece na conferência do dia.
 *   Achar que NÃO foi pago quando foi  → o caixa cobra de novo. O cliente paga
 *                                        duas vezes e vai embora sem saber.
 *
 * O segundo é incomparavelmente pior, então a regra é uma só:
 *
 *     NOTÍCIA DE APROVAÇÃO SEMPRE VENCE, e aprovado nunca desaprova.
 *
 * É por isso que 'aprovada' absorve tudo e pode ser alcançada de qualquer
 * estado, inclusive de 'cancelada'. Esse caso não é teórico: o operador
 * cancela no mesmo segundo em que o cliente encosta o cartão, e as duas coisas
 * acontecem. Se o cancelamento vencesse, a loja teria recebido um dinheiro que
 * o sistema jura não ter recebido.
 *
 * ── Mensagem atrasada ────────────────────────────────────────────────────────
 * Consulta e webhook podem chegar fora de ordem, e uma resposta velha pode
 * aterrissar depois de uma nova. Como só a aprovação é absorvente, uma notícia
 * atrasada de 'aguardando' nunca desfaz um desfecho já conhecido.
 */
export function aplicarNoticia(
  atual: SituacaoCobranca,
  noticia: SituacaoCobranca
): SituacaoCobranca {
  // Uma vez pago, sempre pago. Devolver dinheiro é outra operação, no caminho
  // de estorno da adquirente, e não desfaz o fato de que a cobrança aconteceu.
  if (atual === 'aprovada') return 'aprovada'

  // Aprovação vence de qualquer estado, inclusive de recusa ou cancelamento
  // já registrados.
  //
  // ⚠️ Hoje esta linha é redundante: o `return noticia` lá embaixo já devolveria
  // 'aprovada'. Ela fica de propósito, e a razão é a ordem em que as regras são
  // lidas. Toda guarda nova entra ANTES do fim, e uma delas pode engolir uma
  // aprovação sem querer (bastaria escrever "recusada não vira outra coisa").
  // Com a aprovação decidida aqui em cima, essa classe de engano fica impossível
  // de cometer, em vez de depender de alguém lembrar.
  if (noticia === 'aprovada') return 'aprovada'

  // 'desconhecido' é ausência de informação, nunca uma informação. Ele não pode
  // apagar um desfecho que o sistema já conhecia: seria trocar uma certeza por
  // uma dúvida e mandar o operador consultar uma cobrança já resolvida.
  if (noticia === 'desconhecido' && atual !== 'aguardando') return atual

  return noticia
}

/**
 * Cobranças aprovadas que não viraram venda nenhuma.
 *
 * ── O buraco que isto vigia ──────────────────────────────────────────────────
 * Entre a maquininha aprovar e a venda ser gravada existe uma fresta de alguns
 * segundos. Falta de luz, travamento ou o operador fechando o programa bem ali
 * deixam dinheiro cobrado do cliente sem nenhuma venda no sistema: o estoque
 * não baixou, o caixa não fechou, e ninguém ficou sabendo.
 *
 * Sem esta lista, esse dinheiro só apareceria na conciliação do fim do mês, na
 * forma de um valor a mais no extrato da adquirente que ninguém explica. Com
 * ela, o sistema pergunta ao operador no próximo caixa aberto.
 *
 * ⚠️ Cobrança em 'desconhecido' NÃO entra aqui, mesmo sem venda. Ela pode não
 * ter sido paga, e tratar uma dúvida como dinheiro recebido criaria uma venda
 * do nada. O caminho dela é a consulta, em `decidirCobranca`.
 */
export function cobrancasOrfas(lista: Cobranca[]): Cobranca[] {
  return lista.filter((c) => c.situacao === 'aprovada' && c.vendaId === null)
}
