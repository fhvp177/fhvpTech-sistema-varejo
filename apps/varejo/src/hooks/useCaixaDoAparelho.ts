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
