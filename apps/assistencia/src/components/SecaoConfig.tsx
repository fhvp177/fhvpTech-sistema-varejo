import { FC, ReactNode, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Seção recolhível das Configurações.
//
// Por que existe: a tela cresceu e virou uma rolagem longa onde tudo tem o mesmo
// peso visual. A maior parte é "configure uma vez e esqueça" (segurança, dados
// da loja, impressora) e ocupa espaço permanente por algo que o lojista mexe uma
// vez por ano.
//
// Dois cuidados de uso:
//  - o RESUMO no cabeçalho é o que faz a tela valer fechada: "Segurança —
//    bloqueio em 15 min" responde a pergunta sem precisar abrir. Sem resumo, a
//    seção fechada vira uma caixa preta e o lojista abre todas de novo.
//  - o que ficou aberto é LEMBRADO. Quem foi mexer em algo costuma voltar ali
//    logo depois; reabrir na mão toda vez é atrito bobo.

type Props = {
  /** Identificador estável — é a chave onde o estado aberto/fechado é lembrado. */
  id: string
  titulo: string
  icone?: ReactNode
  /** Texto curto ao lado do título quando fechada (ex.: "bloqueio em 15 min"). */
  resumo?: string | null
  /** Começa aberta na primeira vez? Usado pelo Backup, que é de consulta. */
  padraoAberta?: boolean
  children: ReactNode
}

const chaveConfig = (id: string) => `config_secao_${id}_aberta`

const SecaoConfig: FC<Props> = ({
  id,
  titulo,
  icone,
  resumo,
  padraoAberta = false,
  children
}) => {
  const [aberta, setAberta] = useState(padraoAberta)
  // Evita piscar: só renderiza o conteúdo depois de saber o estado salvo.
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    let vivo = true
    window.api.config
      .obter(chaveConfig(id))
      .then((r) => {
        if (!vivo) return
        if (r.success && r.data) setAberta(r.data === '1')
        setCarregou(true)
      })
      .catch(() => setCarregou(true))
    return () => {
      vivo = false
    }
  }, [id])

  const alternar = () => {
    const novo = !aberta
    setAberta(novo)
    // Não espera a gravação: o clique responde na hora.
    window.api.config.salvar(chaveConfig(id), novo ? '1' : '0')
  }

  return (
    <div className="space-y-4 mb-10">
      <button
        type="button"
        onClick={alternar}
        className="w-full flex items-center justify-between border-b pb-2 text-left group"
      >
        <span className="text-lg font-semibold flex items-center gap-2">
          {icone}
          {titulo}
          {!aberta && resumo && (
            <span className="text-sm font-normal text-muted-foreground">— {resumo}</span>
          )}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground transition-transform group-hover:text-foreground ${
            aberta ? 'rotate-180' : ''
          }`}
        />
      </button>

      {carregou && aberta && children}
    </div>
  )
}

export default SecaoConfig
