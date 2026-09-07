import { useCallback, useEffect, useState } from 'react'

/**
 * Em qual caixa físico ESTE aparelho está.
 *
 * ── Por que é do APARELHO, e não do vendedor ────────────────────────────────
 * O PC do balcão é o Caixa 1 e o notebook é o Caixa 2, independentemente de
 * quem está logado. Amarrar ao vendedor faria a Ana, ao trocar de máquina,
 * levar o caixa dela junto — e as vendas dela cairiam na gaveta errada.
 *
 * Por isso mora em `localStorage`: ele é por navegador e por máquina, que é
 * exatamente o recorte de "aparelho". Sobrevive a recarregar e a trocar de
 * vendedor, e não atravessa para o outro caixa.
 *
 * ⚠️ Não é decisão de segurança e não precisa ser: o backend confere se o caixa
 * escolhido tem turno aberto, e recusa a venda se não tiver. Aqui é só memória
 * de conveniência, para não perguntar a mesma coisa em toda venda.
 */

const CHAVE = 'fhvp_caixa_do_aparelho'

/**
 * Qual caixa este aparelho deve adotar sozinho, ou `null` para perguntar.
 *
 * ── O beco que isto fecha ───────────────────────────────────────────────────
 * A escolha do caixa é do APARELHO, e mora no navegador. Quando o caixa é
 * aberto num aparelho e a venda é tentada em outro — o cliente abre no
 * computador dele, o lojista vende pelo celular —, o segundo não tem escolha
 * gravada. O PDV lia "nenhum caixa" e barrava a venda, com o caixa aberto o
 * tempo todo e sem nada na tela que permitisse escolher.
 *
 * ── ⚠️ Só adota quando não há dúvida sobre qual gaveta é ────────────────────
 * A escolha errada não dá erro: ela faz o dinheiro entrar numa gaveta e ser
 * contado na outra, e as DUAS contagens fecham erradas no fim do dia, uma
 * sobrando e a outra faltando. Por isso a regra é conservadora:
 *
 *   • um único caixa ABERTO      → adota; não existe outra gaveta para confundir
 *   • um único caixa cadastrado  → adota; idem, aberto ou fechado
 *   • dois ou mais abertos       → NÃO adota, e a tela pergunta
 *
 * `jaEscolhido` sempre vence: aparelho que já sabe onde está não muda de gaveta
 * sozinho, nem quando o outro caixa abre.
 */
export function caixaParaAdotar(
  caixas: Array<{ id: number; turno: unknown | null }>,
  jaEscolhido: number | null
): number | null {
  if (jaEscolhido != null) return null
  if (caixas.length === 0) return null

  const abertos = caixas.filter((c) => c.turno != null)
  if (abertos.length === 1) return abertos[0].id
  if (caixas.length === 1) return caixas[0].id
  return null
}

function ler(): number | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    const n = Number(bruto)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    // Navegador com armazenamento bloqueado (aba anônima, política de empresa).
    // Sem memória o sistema apenas volta a perguntar — não é motivo para quebrar.
    return null
  }
}

export function useCaixaDoAparelho(): {
  caixaId: number | null
  escolher: (id: number) => void
  esquecer: () => void
} {
  const [caixaId, setCaixaId] = useState<number | null>(ler)

  // Duas abas do mesmo navegador são o MESMO caixa físico. Sem ouvir o evento,
  // trocar o caixa numa aba deixaria a outra vendendo na gaveta antiga.
  useEffect(() => {
    const aoMudar = (e: StorageEvent) => {
      if (e.key === CHAVE) setCaixaId(ler())
    }
    window.addEventListener('storage', aoMudar)
    return () => window.removeEventListener('storage', aoMudar)
  }, [])

  const escolher = useCallback((id: number) => {
    try {
      localStorage.setItem(CHAVE, String(id))
    } catch {
      // Sem persistir, vale só para esta sessão. Melhor que recusar a escolha.
    }
    setCaixaId(id)
  }, [])

  const esquecer = useCallback(() => {
    try {
      localStorage.removeItem(CHAVE)
    } catch {
      /* idem */
    }
    setCaixaId(null)
  }, [])

  return { caixaId, escolher, esquecer }
}
