import { FC, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Calculator, Delete, History, Minus, Plus, Trash2, X } from 'lucide-react'
import { usePdvMode } from '@/App'
import { avaliarExpressao, formatarExpressao, formatarNumero } from '@/utils/calculadora'

// Calculadora flutuante do balcão.
//
// Por que existe: lojista reclamou de ficar alternando entre o sistema e a
// calculadora do Windows pra fazer conta no meio do atendimento — toda troca de
// janela é uma chance de perder o que estava fazendo. Aqui ela fica POR CIMA do
// sistema, arrastável, e o caixa continua visível atrás.
//
// A conta é digitada INTEIRA ("89,90-10%+12"), não passo a passo: quem confere
// preço no balcão já sabe a conta antes de começar a digitar, e a expressão
// inteira fica à vista pra ser conferida antes do "=". Quem faz a matemática é
// `utils/calculadora.ts` — função pura, com teste, sem `eval`.
//
// Segue o mesmo comportamento de janela do assistente (arrastar pelo cabeçalho,
// grudar dentro da tela ao redimensionar) pra não inventar uma segunda gramática
// de janela flutuante no mesmo sistema.

type Pos = { right: number; bottom: number }
const MARGEM = 16
const LARGURA = 256 // w-64 lá embaixo — usada pra ancorar o padrão pela esquerda
const LARGURA_SIDEBAR = 224 // w-56 da barra lateral (só existe fora do PDV)
const STORAGE_KEY = 'calculadora-pos'

// Tamanhos da janela. Some gente enxerga mal e opera de pé, longe do monitor;
// outra quer a calculadora pequena pra tapar o mínimo da tela. NÃO é guardado
// de propósito: cada abertura começa no tamanho padrão.
const ESCALAS = [0.85, 1, 1.15, 1.35]
const ESCALA_PADRAO = 1

// Teto do que dá pra digitar. Conta de loja não passa disso, e o limite evita
// expressão gigante rolando fora do visor.
const MAX_EXPRESSAO = 60
const MAX_HISTORICO = 30

type Conta = { expressao: string; resultado: number }

// Onde ela nasce: canto inferior ESQUERDO da área de conteúdo.
//
// No PDV esse é o único quadrante sem nada essencial — o leitor de código fica
// em cima, o total e o "Finalizar" moram na coluna da direita, e a barra de
// atalhos ocupa o rodapé. O padrão antigo (canto inferior direito) caía
// exatamente sobre o botão de finalizar a venda. Fora do PDV, desvia da barra
// lateral pra não cobrir o menu.
function posPadrao(pdvAtivo: boolean): Pos {
  const margemEsquerda = (pdvAtivo ? 0 : LARGURA_SIDEBAR) + 24
  return {
    right: Math.max(MARGEM, window.innerWidth - LARGURA - margemEsquerda),
    bottom: 56 // limpa a barra de atalhos do PDV
  }
}

// Posição em que o lojista LARGOU a janela. Só é gravada quando ele arrasta:
// enquanto não arrastar, ela continua nascendo no lugar certo de cada tela.
function carregarPos(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Pos>
      if (typeof p.right === 'number' && typeof p.bottom === 'number') {
        return { right: p.right, bottom: p.bottom }
      }
    }
  } catch {
    // localStorage corrompido/indisponível — cai no padrão.
  }
  return null
}

// Resultado de volta pro visor, no formato de ENTRADA (vírgula decimal, sem
// separador de milhar) — é o que permite continuar a conta em cima dele.
// Número em notação científica não tem como ser reeditado: nesse caso o visor
// recomeça vazio, mas o valor continua no histórico.
function paraEntrada(n: number): string {
  const texto = String(n)
  return texto.includes('e') ? '' : texto.replace('.', ',')
}

const Calculadora: FC<{ aberta: boolean; onFechar: () => void }> = ({ aberta, onFechar }) => {
  const { ativo: pdvAtivo } = usePdvMode()
  const containerRef = useRef<HTMLDivElement>(null)
  // null = nunca foi arrastada; cada abertura usa o padrão da tela onde está.
  const [pos, setPos] = useState<Pos | null>(carregarPos)
  const [escala, setEscala] = useState(ESCALA_PADRAO)

  const [expressao, setExpressao] = useState('')
  const [historico, setHistorico] = useState<Conta[]>([])
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Acabou de sair um resultado: digitar número começa conta nova, mas digitar
  // operador continua em cima do resultado (é o que toda calculadora faz).
  const [recomecar, setRecomecar] = useState(false)

  // Mantém a janela dentro da tela quando o app é redimensionado.
  const clampNaTela = (p: Pos, w: number, h: number): Pos => ({
    right: Math.max(MARGEM, Math.min(p.right, window.innerWidth - w - MARGEM)),
    bottom: Math.max(MARGEM, Math.min(p.bottom, window.innerHeight - h - MARGEM))
  })

  // Roda ao abrir e a cada mudança de tamanho: crescer perto da borda podia
  // empurrar o cabeçalho (a alça de arrastar) pra fora da tela.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || !aberta) return
    const { width, height } = el.getBoundingClientRect()
    // Só a posição arrastada precisa ser trazida de volta pra tela; o padrão já
    // nasce dentro dela.
    setPos((p) => (p ? clampNaTela(p, width, height) : p))
  }, [aberta, escala])

  useEffect(() => {
    const aoRedimensionar = () => {
      const el = containerRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      setPos((p) => (p ? clampNaTela(p, width, height) : p))
    }
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  function aoPressionar(e: React.PointerEvent): void {
    if (e.button !== 0) return
    const inicioX = e.clientX
    const inicioY = e.clientY
    const inicio = pos ?? posPadrao(pdvAtivo)
    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 0
    const h = rect?.height ?? 0
    let ultima = inicio

    const mover = (ev: PointerEvent) => {
      ultima = clampNaTela(
        {
          right: inicio.right - (ev.clientX - inicioX),
          bottom: inicio.bottom - (ev.clientY - inicioY)
        },
        w,
        h
      )
      setPos(ultima)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      // Grava só aqui: arrastou uma vez, o sistema lembra pra sempre. Enquanto
      // não arrastar, ela continua se ajustando à tela em que for aberta.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ultima))
      } catch {
        // Sem localStorage a janela só não lembra — nada quebra.
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // ── Digitação ───────────────────────────────────────────────────────────────

  const acrescentar = (texto: string, comecaContaNova: boolean) => {
    setErro(null)
    setExpressao((atual) => {
      const base = comecaContaNova && recomecar ? '' : atual
      if (base.length + texto.length > MAX_EXPRESSAO) return base
      return base + texto
    })
    setRecomecar(false)
  }

  const digitar = (d: string) => acrescentar(d, true)

  // Vírgula só entra uma vez por número: procura o trecho depois do último
  // sinal e vê se ele já tem separador.
  const separador = () => {
    setErro(null)
    setExpressao((atual) => {
      const base = recomecar ? '' : atual
      const ultimoNumero = base.split(/[+\-*/()%]/).pop() ?? ''
      if (ultimoNumero.includes(',')) return base
      if (base.length + 2 > MAX_EXPRESSAO) return base
      // "5+," não é número: abre com zero.
      return ultimoNumero === '' ? `${base}0,` : `${base},`
    })
    setRecomecar(false)
  }

  // Operador em cima de operador troca o anterior (errou o sinal, corrige sem
  // apagar). O menos também abre conta, como número negativo.
  const operar = (op: '+' | '-' | '*' | '/') => {
    setErro(null)
    setExpressao((atual) => {
      if (atual === '') return op === '-' ? op : atual
      if (/[+\-*/]$/.test(atual)) return atual.slice(0, -1) + op
      if (atual.length + 1 > MAX_EXPRESSAO) return atual
      return atual + op
    })
    setRecomecar(false)
  }

  const porcento = () => {
    if (expressao === '' || /[+\-*/(%]$/.test(expressao)) return
    acrescentar('%', false)
  }

  const parentese = () => {
    // Um botão só: abre enquanto houver parêntese pendente a abrir, senão fecha.
    const abertos = (expressao.match(/\(/g) ?? []).length
    const fechados = (expressao.match(/\)/g) ?? []).length
    const podeFechar = abertos > fechados && /[\d%)]$/.test(expressao)
    acrescentar(podeFechar ? ')' : '(', !podeFechar)
  }

  const igual = () => {
    if (!expressao) return
    const r = avaliarExpressao(expressao)
    if (!r.ok) {
      setErro(r.erro)
      return
    }
    // Conta que é só um número não vira histórico — não houve cálculo.
    if (/^-?[\d,]+$/.test(expressao.trim())) {
      setRecomecar(true)
      return
    }
    setHistorico((h) => [{ expressao, resultado: r.valor }, ...h].slice(0, MAX_HISTORICO))
    setExpressao(paraEntrada(r.valor))
    setErro(null)
    setRecomecar(true)
  }

  const limpar = () => {
    setExpressao('')
    setErro(null)
    setRecomecar(false)
  }

  const apagar = () => {
    setErro(null)
    setExpressao((v) => v.slice(0, -1))
    setRecomecar(false)
  }

  const reusar = (valor: number) => {
    const texto = paraEntrada(valor)
    if (!texto) return
    setErro(null)
    setExpressao((atual) => {
      const base = recomecar ? '' : atual
      return base.length + texto.length > MAX_EXPRESSAO ? base : base + texto
    })
    setRecomecar(false)
  }

  const mudarEscala = (passo: number) => {
    setEscala((atual) => {
      const i = ESCALAS.indexOf(atual)
      const proximo = ESCALAS[Math.min(ESCALAS.length - 1, Math.max(0, i + passo))]
      return proximo ?? atual
    })
  }

  // Ao abrir, puxa o foco pra cá e, ao fechar, devolve pra onde estava. Sem
  // isso a calculadora abre "morta" no PDV: o foco continua no leitor de código
  // de barras, e cada dígito digitado vai parar no campo do caixa.
  const focoAnterior = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (aberta) {
      focoAnterior.current = document.activeElement as HTMLElement | null
      containerRef.current?.focus()
      setEscala(ESCALA_PADRAO)
    } else {
      focoAnterior.current?.focus()
      focoAnterior.current = null
    }
  }, [aberta])

  // Teclado físico — quem faz conta o dia todo digita, não clica.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      // A escuta é da janela inteira, então precisa recuar quando o usuário está
      // digitando num campo: no PDV, roubar as teclas aqui mataria o leitor de
      // código de barras, que é um input sempre focado.
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) {
        return
      }
      const k = e.key
      if (k >= '0' && k <= '9') digitar(k)
      // Ponto e vírgula são a mesma tecla decimal aqui (ver utils/calculadora).
      else if (k === ',' || k === '.') separador()
      else if (k === '+' || k === '-' || k === '*' || k === '/') operar(k)
      else if (k === 'Enter' || k === '=') igual()
      else if (k === 'Backspace') apagar()
      else if (k === 'Escape') limpar()
      else if (k === '%') porcento()
      else if (k === '(' || k === ')') acrescentar(k, k === '(')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, expressao, recomecar])

  if (!aberta) return null

  const posAtual = pos ?? posPadrao(pdvAtivo)
  const ultima = historico[0]

  // Pra que lado a janela cresce ao aumentar de tamanho: sempre pro CENTRO da
  // tela. Ancorada à esquerda (o padrão do PDV), crescer pela direita jogaria a
  // borda esquerda pra fora; do lado direito, o contrário. Só olhar em que
  // metade ela está resolve os dois casos.
  const naMetadeEsquerda = window.innerWidth - posAtual.right - LARGURA < window.innerWidth / 2
  const origemCrescimento = naMetadeEsquerda ? 'bottom left' : 'bottom right'

  // Prévia do resultado enquanto digita — só quando já existe conta pra fazer.
  // Expressão pela metade ("2+") não é erro: a pessoa ainda está digitando.
  const previa = (() => {
    if (!expressao || !/[+\-*/%]/.test(expressao.slice(1))) return null
    const r = avaliarExpressao(expressao)
    return r.ok ? formatarNumero(r.valor) : null
  })()

  const Tecla: FC<{
    onClick: () => void
    children: React.ReactNode
    variante?: 'normal' | 'operador' | 'igual' | 'acao'
    className?: string
    titulo?: string
  }> = ({ onClick, children, variante = 'normal', className = '', titulo }) => {
    const cores = {
      normal: 'bg-white hover:bg-slate-100 text-slate-800',
      operador: 'bg-slate-100 hover:bg-slate-200 text-blue-700 font-semibold',
      igual: 'bg-blue-600 hover:bg-blue-700 text-white font-semibold',
      acao: 'bg-slate-100 hover:bg-slate-200 text-slate-600'
    }
    return (
      <button
        type="button"
        onClick={onClick}
        title={titulo}
        className={`h-11 rounded-lg border border-slate-200 text-base transition-colors ${cores[variante]} ${className}`}
      >
        {children}
      </button>
    )
  }

  const BotaoCabecalho: FC<{
    onClick: () => void
    titulo: string
    ativo?: boolean
    children: React.ReactNode
  }> = ({ onClick, titulo, ativo = false, children }) => (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className={`p-1 rounded transition-colors ${
        ativo ? 'bg-slate-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed z-50 outline-none"
      style={{ right: posAtual.right, bottom: posAtual.bottom }}
    >
      <div
        className="w-64 rounded-xl border border-slate-300 bg-slate-50 shadow-2xl overflow-hidden"
        style={{ transform: `scale(${escala})`, transformOrigin: origemCrescimento }}
      >
        {/* Cabeçalho: também é a alça pra arrastar */}
        <div
          onPointerDown={aoPressionar}
          className="flex items-center justify-between bg-slate-800 pl-3 pr-2 py-2 cursor-move select-none"
        >
          <span className="flex items-center gap-1.5 text-sm text-white font-medium">
            <Calculator className="w-4 h-4" />
            Calculadora
          </span>
          <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
            <BotaoCabecalho onClick={() => mudarEscala(-1)} titulo="Diminuir a calculadora">
              <Minus className="w-3.5 h-3.5" />
            </BotaoCabecalho>
            <BotaoCabecalho onClick={() => mudarEscala(1)} titulo="Aumentar a calculadora">
              <Plus className="w-3.5 h-3.5" />
            </BotaoCabecalho>
            <BotaoCabecalho
              onClick={() => setMostrarHistorico((v) => !v)}
              titulo="Contas anteriores"
              ativo={mostrarHistorico}
            >
              <History className="w-3.5 h-3.5" />
            </BotaoCabecalho>
            <BotaoCabecalho onClick={onFechar} titulo="Fechar">
              <X className="w-4 h-4" />
            </BotaoCabecalho>
          </div>
        </div>

        {/* Histórico: aberto vira lista; fechado, só a última conta */}
        {mostrarHistorico ? (
          <div className="bg-slate-100 border-b border-slate-200 max-h-36 overflow-y-auto">
            {historico.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">
                As contas que você fizer aparecem aqui.
              </p>
            ) : (
              <>
                {historico.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => reusar(c.resultado)}
                    title="Usar este resultado na conta"
                    className="w-full text-right px-3 py-1.5 hover:bg-slate-200 transition-colors border-b border-slate-200/70 last:border-0"
                  >
                    <div className="text-[11px] text-slate-500 truncate">
                      {formatarExpressao(c.expressao)}
                    </div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums truncate">
                      {formatarNumero(c.resultado)}
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setHistorico([])}
                  className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] text-slate-500 hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar histórico
                </button>
              </>
            )}
          </div>
        ) : (
          ultima && (
            <button
              type="button"
              onClick={() => reusar(ultima.resultado)}
              title="Usar este resultado na conta"
              className="w-full bg-slate-100 border-b border-slate-200 px-3 py-1 text-right text-[11px] text-slate-500 hover:bg-slate-200 transition-colors truncate"
            >
              {formatarExpressao(ultima.expressao)} = {formatarNumero(ultima.resultado)}
            </button>
          )
        )}

        {/* Visor: a conta inteira em cima, o resultado provável embaixo */}
        <div className="bg-white px-3 py-2 text-right">
          <div
            className="text-2xl font-semibold tabular-nums truncate"
            title={formatarExpressao(expressao)}
          >
            {expressao ? formatarExpressao(expressao) : '0'}
          </div>
          <div className="h-4 text-xs tabular-nums truncate">
            {erro ? (
              <span className="text-destructive">{erro}</span>
            ) : previa ? (
              <span className="text-slate-400">= {previa}</span>
            ) : null}
          </div>
        </div>

        {/* Teclado */}
        <div className="grid grid-cols-4 gap-1.5 p-2">
          <Tecla onClick={limpar} variante="acao" titulo="Limpar tudo (Esc)">
            C
          </Tecla>
          <Tecla onClick={apagar} variante="acao" titulo="Apagar o último (Backspace)">
            <Delete className="w-4 h-4 mx-auto" />
          </Tecla>
          <Tecla onClick={parentese} variante="acao" titulo="Parênteses">
            ( )
          </Tecla>
          <Tecla onClick={() => operar('/')} variante="operador">
            ÷
          </Tecla>

          {['7', '8', '9'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => operar('*')} variante="operador">
            ×
          </Tecla>

          {['4', '5', '6'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => operar('-')} variante="operador">
            −
          </Tecla>

          {['1', '2', '3'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => operar('+')} variante="operador">
            +
          </Tecla>

          <Tecla onClick={() => digitar('0')}>0</Tecla>
          <Tecla onClick={separador}>,</Tecla>
          <Tecla onClick={porcento} variante="acao" titulo="Porcentagem: 200+10% = 220">
            %
          </Tecla>
          <Tecla onClick={igual} variante="igual">
            =
          </Tecla>
        </div>

        <p className="px-3 pb-2 text-[10px] text-slate-400 text-center">
          Digite a conta inteira — ex.: 89,90−10%
        </p>
      </div>
    </div>
  )
}

export default Calculadora
