import { useEffect, useState } from 'react'

/**
 * As contas que podem receber dinheiro, para o seletor do recebimento.
 *
 * ── ⚠️ Só contas ATIVAS, e a lista vem do canal de sempre ───────────────────
 * `financeiro:listarContas` sem argumento já devolve só as ativas. Conta
 * desativada continua no histórico (é por isso que ela é desativada e não
 * apagada), mas oferecer uma delas aqui criaria movimento novo numa conta que o
 * lojista tirou de circulação.
 *
 * ── Por que um gancho, e não uma busca em cada tela ─────────────────────────
 * O seletor aparece em três lugares (venda no balcão, recebimento de dívida e
 * baixa de parcela). Três cópias da busca dariam três momentos diferentes de
 * carregar, e a tela que esquecesse o `catch` derrubaria o fluxo do caixa por
 * causa de uma lista de apoio.
 *
 * ⚠️ Falha vira lista VAZIA, nunca erro na tela. Sem a lista o seletor some, e
 * o sistema volta a decidir a conta sozinho, como fazia antes — que é o
 * comportamento certo para degradar: recebe o dinheiro do mesmo jeito.
 */
export type ContaDeEntrada = { id: number; nome: string }

export function useContasDeEntrada(): ContaDeEntrada[] {
  const [contas, setContas] = useState<ContaDeEntrada[]>([])

  useEffect(() => {
    let vivo = true
    window.api.financeiro
      .listarContas()
      .then((r) => {
        if (vivo && r.success) {
          setContas(r.data.map((c) => ({ id: c.id, nome: c.nome })))
        }
      })
      .catch(() => {
        /* lista vazia: o seletor some e o sistema decide como antes */
      })
    return () => {
      vivo = false
    }
  }, [])

  return contas
}
