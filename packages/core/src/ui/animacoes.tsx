import { useCallback, useEffect, useRef, useState } from 'react'
import './animacoes.css'

/**
 * Os gatilhos das animações de trabalho (ver o bloco de baixo de animacoes.css).
 *
 * ⚠️ É `.tsx` sem nenhum JSX de propósito: o mapa de `exports` do core publica
 * `./ui/*` apontando só para `.tsx`. Trocar o mapa para aceitar `.ts` também
 * mexeria na resolução de todos os outros módulos de UI — renomear o arquivo é
 * a mudança menor.
 *
 * ── Por que ganchos, e não a classe direto na tela ──────────────────────────
 * As três primeiras animações precisam de MEMÓRIA: alguém tem que lembrar que a
 * linha 7 acabou de entrar, que a linha 3 está saindo, que o total mudou faz
 * 200ms. Escrever esse controle de tempo em cada tela daria oito cópias de um
 * `setTimeout` que ninguém revisa — e `setTimeout` sem `clearTimeout` num
 * componente que desmonta é vazamento e aviso no console.
 *
 * Aqui o controle mora num lugar só, e a tela só pergunta "essa linha é nova?".
 */

/** Duração de cada realce. Espelha os tempos do CSS — mexeu num, mexa no outro. */
const MS_LINHA_ENTRA = 850
const MS_LINHA_SAI = 220
const MS_VALOR_MUDA = 650
const MS_FOCO_REALCE = 600

/**
 * Marca linhas recém-chegadas para o realce de entrada.
 *
 * Uso: `const nova = useLinhaNova()` → `nova.marcar(chave)` quando o item entra,
 * e `className={nova.ehNova(chave) ? 'anim-linha-entra' : ''}` na linha.
 *
 * A chave é a MESMA do `key` do React. No PDV isso importa: bipar duas vezes o
 * mesmo produto não cria linha nova, só soma a quantidade — e o realce dispara
 * de novo na linha que já existia, que é exatamente o certo (algo entrou ali).
 */
export function useLinhaNova(): {
  marcar: (chave: string) => void
  ehNova: (chave: string) => boolean
} {
  const [novas, setNovas] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t)
      timers.current.clear()
    },
    []
  )

  const marcar = useCallback((chave: string) => {
    // Bipou de novo antes de o realce anterior acabar: reinicia o relógio em vez
    // de deixar o primeiro apagar no meio do segundo.
    const anterior = timers.current.get(chave)
    if (anterior) clearTimeout(anterior)

    setNovas((prev) => {
      if (prev.has(chave)) {
        // Força um ciclo novo de animação: sai e volta no quadro seguinte, senão
        // o CSS não reinicia (a classe nunca deixou de casar).
        const semEla = new Set(prev)
        semEla.delete(chave)
        return semEla
      }
      return new Set(prev).add(chave)
    })

    // Entra (ou reentra) no próximo quadro.
    requestAnimationFrame(() => {
      setNovas((prev) => new Set(prev).add(chave))
      timers.current.set(
        chave,
        setTimeout(() => {
          timers.current.delete(chave)
          setNovas((prev) => {
            const sem = new Set(prev)
            sem.delete(chave)
            return sem
          })
        }, MS_LINHA_ENTRA)
      )
    })
  }, [])

  const ehNova = useCallback((chave: string) => novas.has(chave), [novas])

  return { marcar, ehNova }
}

/**
 * Faz a linha sair na tela ANTES de sair dos dados.
 *
 * Uso:
 *   const saida = useSaidaDeLinha()
 *   <tr className={saida.estaSaindo(chave) ? 'anim-linha-sai' : ''}>
 *   ...
 *   saida.sairEntao(chave, () => apagarDeVerdade(id))
 *
 * ⚠️ A exclusão real acontece DEPOIS da animação, no callback. Se a tela
 * desmontar no meio (o usuário fechou o diálogo, trocou de aba), o timer é
 * cancelado e a exclusão NÃO acontece — de propósito: melhor não apagar do que
 * apagar sem a pessoa ver.
 */
export function useSaidaDeLinha(): {
  estaSaindo: (chave: string) => boolean
  sairEntao: (chave: string, aoTerminar: () => void) => void
} {
  const [saindo, setSaindo] = useState<Set<string>>(new Set())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      for (const t of timers.current) clearTimeout(t)
      timers.current.clear()
    }
  }, [])

  const sairEntao = useCallback((chave: string, aoTerminar: () => void) => {
    setSaindo((prev) => new Set(prev).add(chave))
    const t = setTimeout(() => {
      timers.current.delete(t)
      if (!vivo.current) return
      setSaindo((prev) => {
        const sem = new Set(prev)
        sem.delete(chave)
        return sem
      })
      aoTerminar()
    }, MS_LINHA_SAI)
    timers.current.add(t)
  }, [])

  const estaSaindo = useCallback((chave: string) => saindo.has(chave), [saindo])

  return { estaSaindo, sairEntao }
}

/**
 * `true` durante o realce, logo depois que o valor mudar.
 *
 * Duas situações NÃO contam como mudança, de propósito:
 *
 *  1. A primeira renderização. Abrir a tela não é "o número mudou", e um app que
 *     pisca inteiro ao abrir cansa mais do que informa.
 *  2. O valor chegando de `undefined` para um número. É o caso do cartão que
 *     mostra "..." enquanto a consulta não voltou: quando ela volta, o número
 *     não mudou — ele APARECEU. Sem esta regra, todo cartão da tela daria um
 *     pulso no carregamento, que é justamente o susto que se quer evitar.
 */
export function useValorMudou(valor: number | string | undefined): boolean {
  const [mudou, setMudou] = useState(false)
  const anterior = useRef(valor)
  const primeira = useRef(true)

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      anterior.current = valor
      return
    }
    const antes = anterior.current
    anterior.current = valor
    if (antes === valor) return
    if (antes === undefined || valor === undefined) return

    setMudou(true)
    const t = setTimeout(() => setMudou(false), MS_VALOR_MUDA)
    return () => clearTimeout(t)
  }, [valor])

  return mudou
}

/**
 * Põe o foco num campo E avisa visualmente que ele foi parar ali.
 *
 * Use no lugar de `elemento.focus()` sempre que quem move o foco for o SISTEMA,
 * não a pessoa. Quando é ela que aperta Tab, o anel de foco comum já basta —
 * ninguém precisa ser avisado de onde acabou de clicar.
 *
 * A classe é retirada no fim da animação; se o elemento sumir antes, o listener
 * some junto com ele.
 */
export function focarComRealce(elemento: HTMLElement | null | undefined): void {
  if (!elemento) return
  elemento.focus()
  elemento.classList.remove('anim-foco-realce')
  // Lê uma propriedade de layout para forçar o reinício da animação quando o
  // foco vai para o MESMO campo duas vezes seguidas (bipar em sequência no PDV).
  void elemento.offsetWidth
  elemento.classList.add('anim-foco-realce')
  setTimeout(() => elemento.classList.remove('anim-foco-realce'), MS_FOCO_REALCE)
}
