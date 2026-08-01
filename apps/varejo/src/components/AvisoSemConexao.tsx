import { FC, useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Estado do multicaixa nesta máquina, para a interface.
 *
 * A resposta inicial vem por consulta e as mudanças chegam por evento — não por
 * consulta repetida. Quando a conexão cai, o operador precisa saber no mesmo
 * instante, com o cliente na frente dele; meio segundo de atraso é a diferença
 * entre "não consigo vender" e "vendi e não registrou".
 */
export function useSituacaoMulticaixa(): { ehCaixaAdicional: boolean; conectado: boolean } {
  const [modo, setModo] = useState<'normal' | 'servidor' | 'terminal'>('normal')
  const [conectado, setConectado] = useState(true)

  useEffect(() => {
    // No Básico o multicaixa não existe e os canais nem são registrados —
    // perguntar daria erro sem handler. A flag é constante no build, então este
    // trecho some do binário daquela edição.
    if (!__FEAT_MULTICAIXA__) return
    window.api.multicaixa.situacao().then((r) => {
      if (!r.success) return
      setModo(r.data.modo)
      setConectado(r.data.conectado)
    })
    return window.api.multicaixa.onConexao(setConectado)
  }, [])

  return { ehCaixaAdicional: modo === 'terminal', conectado }
}

/**
 * Faixa de aviso quando este caixa perde contato com o principal.
 *
 * O texto evita a palavra "erro" de propósito: não houve falha do sistema, e a
 * ação certa não é chamar o suporte — é conferir a rede e esperar. Também não
 * inventa prazo, porque o app não tem como saber quando volta.
 */
const AvisoSemConexao: FC = () => {
  const { ehCaixaAdicional, conectado } = useSituacaoMulticaixa()

  if (!ehCaixaAdicional || conectado) return null

  return (
    <div className="shrink-0 bg-red-600 text-white px-6 py-2 flex items-center gap-2 text-sm">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        <span className="font-semibold">Sem conexão com o caixa principal.</span> Este computador
        não consegue consultar nem registrar nada agora. Confira se o computador da loja está
        ligado e na rede — a conexão volta sozinha.
      </span>
    </div>
  )
}

export default AvisoSemConexao
