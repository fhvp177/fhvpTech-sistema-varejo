import { FC, ReactNode, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
// A folha entra por AQUI, e não por `.../animacoes.css`: o `exports` do core
// publica `./ui/*` só como `.tsx`, então o caminho do CSS não resolve. Este
// módulo importa a folha, e o import explícito deixa a dependência visível em
// vez de depender de outro componente da tela tê-la puxado por acaso.
import '@fhvptech/core/ui/animacoes'

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
//
// ── Sobre a cor ──────────────────────────────────────────────────────────────
// Tudo aqui é a MESMA cor — a da marca — variando só em intensidade: o ícone
// fica mais forte quando a seção está aberta, e o cabeçalho ganha uma lâmina de
// fundo. A alternativa (uma cor por seção: âmbar em Segurança, verde em Dados
// da loja) deixaria a tela mais fácil de varrer, mas essas cores sairiam iguais
// em todos os nichos, ignorando o white-label. `blue` neste código NÃO é azul:
// cada app remapeia a escala no seu tailwind.config (petróleo na assistência,
// azul no varejo), então a mesma classe nasce certa em cada loja.
//
// ── Sobre a abertura ─────────────────────────────────────────────────────────
// A sanfona é a única animação da casa que mexe em layout, e o porquê está por
// extenso no cabeçalho dela em `animacoes.css`. Aqui fica só a parte que o CSS
// não consegue resolver sozinho: o recorte tem que sair depois que a transição
// acaba, senão qualquer popover dentro de uma seção aberta aparece cortado.

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
  // Recorta só enquanto a sanfona se move (ver comentário no topo).
  const [recortando, setRecortando] = useState(true)
  // O conteúdo continua sendo montado PREGUIÇOSAMENTE, como antes da sanfona.
  // Deixar as 6 seções montadas e apenas escondidas custaria caro: várias delas
  // disparam IPC ao montar (vendedores, multicaixa, impressão), e a tela passaria
  // a abrir fazendo meia dúzia de idas ao banco que ninguém pediu.
  //
  // A desmontagem, porém, espera a sanfona FECHAR. Se o conteúdo sumisse no
  // clique, a caixa se fecharia vazia — o olho veria o buraco antes do fecho.
  const [montado, setMontado] = useState(false)
  // Na primeira pintura a seção já nasce no estado salvo, sem animar: abrir o
  // app e ver três seções se desdobrando sozinhas seria o "app que se sacode ao
  // abrir" — o mesmo motivo pelo qual foco de montagem não ganha realce.
  const primeiraPintura = useRef(true)

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

  useEffect(() => {
    if (aberta) setMontado(true)
  }, [aberta])

  useEffect(() => {
    if (!carregou) return
    // Solta o recorte da seção que já nasceu aberta — ela não vai transicionar,
    // então onTransitionEnd nunca chegaria.
    if (primeiraPintura.current) {
      primeiraPintura.current = false
      setRecortando(!aberta)
    }
  }, [carregou, aberta])

  const alternar = () => {
    const novo = !aberta
    setAberta(novo)
    setRecortando(true)
    // Não espera a gravação: o clique responde na hora.
    window.api.config.salvar(chaveConfig(id), novo ? '1' : '0')
  }

  return (
    <div
      className={`mb-4 rounded-lg border bg-background transition-[box-shadow,transform,border-color] duration-200 motion-reduce:transition-none ${
        aberta
          ? 'border-blue-600/30 shadow-sm'
          : 'hover:-translate-y-px hover:shadow-md hover:border-blue-600/25 motion-reduce:hover:transform-none'
      }`}
    >
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        className={`anim-gatilho w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-colors duration-200 motion-reduce:transition-none ${
          aberta ? 'bg-blue-600/5 rounded-b-none' : 'hover:bg-muted/40'
        }`}
      >
        {icone && (
          <span
            className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center transition-colors duration-200 motion-reduce:transition-none ${
              aberta ? 'bg-blue-600/20 text-blue-700' : 'bg-blue-600/10 text-blue-600'
            }`}
          >
            <span className="anim-alvo-acena">{icone}</span>
          </span>
        )}

        <span className="flex-1 min-w-0">
          <span className="block text-lg font-semibold leading-tight">{titulo}</span>
          {!aberta && resumo && (
            <span className="block text-sm font-normal text-muted-foreground truncate">
              {resumo}
            </span>
          )}
        </span>

        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
            aberta ? 'rotate-180 text-blue-600' : 'text-muted-foreground'
          }`}
        />
      </button>

      {carregou && (
        <div
          className={`anim-sanfona ${aberta ? 'anim-sanfona-aberta' : ''}`}
          onTransitionEnd={(e) => {
            // Só a trilha do grid conta: as transições do conteúdo (opacity e
            // transform) sobem por bubbling e chegariam aqui também, soltando o
            // recorte cedo demais, no meio do movimento da caixa.
            if (e.propertyName !== 'grid-template-rows') return
            setRecortando(!aberta)
            if (!aberta) setMontado(false)
          }}
        >
          <div className={recortando ? 'anim-sanfona-recorta' : ''}>
            {montado && (
              <div className="anim-sanfona-conteudo border-t px-4 py-4">{children}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SecaoConfig
