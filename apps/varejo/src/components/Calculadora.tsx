import { FC, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Calculator, Delete, X } from 'lucide-react'

// Calculadora flutuante do balcão.
//
// Por que existe: lojista reclamou de ficar alternando entre o sistema e a
// calculadora do Windows pra fazer conta no meio do atendimento — toda troca de
// janela é uma chance de perder o que estava fazendo. Aqui ela fica POR CIMA do
// sistema, arrastável, e o caixa continua visível atrás.
//
// Aritmética em JavaScript puro: nenhuma biblioteca, nada de `eval`. O peso no
// binário é irrelevante.
//
// Segue o mesmo comportamento de janela do assistente (arrastar pelo cabeçalho,
// grudar dentro da tela ao redimensionar) pra não inventar uma segunda gramática
// de janela flutuante no mesmo sistema.

type Pos = { right: number; bottom: number }
const MARGEM = 16
const POS_INICIAL: Pos = { right: 24, bottom: 90 }

type Operador = '+' | '-' | '*' | '/' | null

// Arredonda o resultado pra 10 casas antes de exibir: em ponto flutuante,
// 0.1 + 0.2 dá 0.30000000000000004, e isso na tela de uma calculadora de loja
// parece defeito.
function formatar(n: number): string {
  if (!Number.isFinite(n)) return 'Erro'
  const arredondado = Math.round((n + Number.EPSILON) * 1e10) / 1e10
  return String(arredondado).replace('.', ',')
}

const Calculadora: FC<{ aberta: boolean; onFechar: () => void }> = ({ aberta, onFechar }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos>(POS_INICIAL)

  const [visor, setVisor] = useState('0')
  const [acumulado, setAcumulado] = useState<number | null>(null)
  const [operador, setOperador] = useState<Operador>(null)
  // Depois de apertar um operador, o próximo dígito começa um número novo em
  // vez de emendar no que está no visor.
  const [recomecar, setRecomecar] = useState(false)

  // Mantém a janela dentro da tela quando o app é redimensionado.
  const clampNaTela = (p: Pos, w: number, h: number): Pos => ({
    right: Math.max(MARGEM, Math.min(p.right, window.innerWidth - w - MARGEM)),
    bottom: Math.max(MARGEM, Math.min(p.bottom, window.innerHeight - h - MARGEM))
  })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || !aberta) return
    const { width, height } = el.getBoundingClientRect()
    setPos((p) => clampNaTela(p, width, height))
  }, [aberta])

  useEffect(() => {
    const aoRedimensionar = () => {
      const el = containerRef.current
      if (!el) return
      const { width, height } = el.getBoundingClientRect()
      setPos((p) => clampNaTela(p, width, height))
    }
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  function aoPressionar(e: React.PointerEvent): void {
    if (e.button !== 0) return
    const inicioX = e.clientX
    const inicioY = e.clientY
    const inicio = pos
    const rect = containerRef.current?.getBoundingClientRect()
    const w = rect?.width ?? 0
    const h = rect?.height ?? 0

    const mover = (ev: PointerEvent) => {
      setPos(
        clampNaTela(
          {
            right: inicio.right - (ev.clientX - inicioX),
            bottom: inicio.bottom - (ev.clientY - inicioY)
          },
          w,
          h
        )
      )
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // ── Aritmética ──────────────────────────────────────────────────────────────

  const valorAtual = () => Number(visor.replace(/\./g, '').replace(',', '.'))

  const digitar = (d: string) => {
    setVisor((v) => {
      if (recomecar || v === '0') return d
      if (v.replace(/[^0-9]/g, '').length >= 12) return v // trava tamanho absurdo
      return v + d
    })
    setRecomecar(false)
  }

  const virgula = () => {
    setVisor((v) => (recomecar ? '0,' : v.includes(',') ? v : v + ','))
    setRecomecar(false)
  }

  const calcular = (a: number, b: number, op: Operador): number => {
    switch (op) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      case '/':
        return b === 0 ? NaN : a / b
      default:
        return b
    }
  }

  const aplicarOperador = (op: Exclude<Operador, null>) => {
    const atual = valorAtual()
    if (acumulado !== null && operador && !recomecar) {
      const r = calcular(acumulado, atual, operador)
      setAcumulado(r)
      setVisor(formatar(r))
    } else {
      setAcumulado(atual)
    }
    setOperador(op)
    setRecomecar(true)
  }

  const igual = () => {
    if (acumulado === null || !operador) return
    const r = calcular(acumulado, valorAtual(), operador)
    setVisor(formatar(r))
    setAcumulado(null)
    setOperador(null)
    setRecomecar(true)
  }

  const limpar = () => {
    setVisor('0')
    setAcumulado(null)
    setOperador(null)
    setRecomecar(false)
  }

  const apagar = () => {
    setVisor((v) => (v.length <= 1 || (v.length === 2 && v.startsWith('-')) ? '0' : v.slice(0, -1)))
  }

  const porcento = () => {
    // Comportamento de calculadora de loja: "200 + 10 %" = 200 + 10% de 200.
    const atual = valorAtual()
    const base = acumulado ?? 0
    const r = operador && acumulado !== null ? (base * atual) / 100 : atual / 100
    setVisor(formatar(r))
    setRecomecar(true)
  }

  // Teclado físico — quem faz conta o dia todo digita, não clica.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      const k = e.key
      if (k >= '0' && k <= '9') digitar(k)
      else if (k === ',' || k === '.') virgula()
      else if (k === '+' || k === '-' || k === '*' || k === '/') aplicarOperador(k)
      else if (k === 'Enter' || k === '=') igual()
      else if (k === 'Backspace') apagar()
      else if (k === 'Escape') limpar()
      else if (k === '%') porcento()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta, visor, acumulado, operador, recomecar])

  if (!aberta) return null

  const Tecla: FC<{
    onClick: () => void
    children: React.ReactNode
    variante?: 'normal' | 'operador' | 'igual' | 'acao'
    className?: string
  }> = ({ onClick, children, variante = 'normal', className = '' }) => {
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
        className={`h-11 rounded-lg border border-slate-200 text-base transition-colors ${cores[variante]} ${className}`}
      >
        {children}
      </button>
    )
  }

  return (
    <div ref={containerRef} className="fixed z-50" style={{ right: pos.right, bottom: pos.bottom }}>
      <div className="w-64 rounded-xl border border-slate-300 bg-slate-50 shadow-2xl overflow-hidden">
        {/* Cabeçalho: também é a alça pra arrastar */}
        <div
          onPointerDown={aoPressionar}
          className="flex items-center justify-between bg-slate-800 px-3 py-2 cursor-move select-none"
        >
          <span className="flex items-center gap-1.5 text-sm text-white font-medium">
            <Calculator className="w-4 h-4" />
            Calculadora
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="text-slate-300 hover:text-white"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visor */}
        <div className="bg-white px-3 py-3 text-right">
          <div className="h-4 text-xs text-slate-400 tabular-nums">
            {acumulado !== null && operador
              ? `${formatar(acumulado)} ${operador === '*' ? '×' : operador === '/' ? '÷' : operador}`
              : ''}
          </div>
          <div className="text-2xl font-semibold tabular-nums truncate" title={visor}>
            {visor}
          </div>
        </div>

        {/* Teclado */}
        <div className="grid grid-cols-4 gap-1.5 p-2">
          <Tecla onClick={limpar} variante="acao">
            C
          </Tecla>
          <Tecla onClick={apagar} variante="acao">
            <Delete className="w-4 h-4 mx-auto" />
          </Tecla>
          <Tecla onClick={porcento} variante="acao">
            %
          </Tecla>
          <Tecla onClick={() => aplicarOperador('/')} variante="operador">
            ÷
          </Tecla>

          {['7', '8', '9'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => aplicarOperador('*')} variante="operador">
            ×
          </Tecla>

          {['4', '5', '6'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => aplicarOperador('-')} variante="operador">
            −
          </Tecla>

          {['1', '2', '3'].map((d) => (
            <Tecla key={d} onClick={() => digitar(d)}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={() => aplicarOperador('+')} variante="operador">
            +
          </Tecla>

          <Tecla onClick={() => digitar('0')} className="col-span-2">
            0
          </Tecla>
          <Tecla onClick={virgula}>,</Tecla>
          <Tecla onClick={igual} variante="igual">
            =
          </Tecla>
        </div>

        <p className="px-3 pb-2 text-[10px] text-slate-400 text-center">
          Você também pode usar o teclado
        </p>
      </div>
    </div>
  )
}

export default Calculadora
