import { FC, useRef, useState } from 'react'
import { AlertTriangle, Check, Clock, FileText, Landmark } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import BotaoNotaFiscal from '@/components/BotaoNotaFiscal'
import BotaoNotaServico from '@/components/BotaoNotaServico'
import {
  documentosQueCabem,
  estadoCombinado,
  resumoDoEstado,
  type Documento,
  type GatilhoNota
} from '@/utils/notasDaVenda'

/**
 * As notas fiscais de UMA venda, num ponto de entrada só.
 *
 * ── O que este componente resolve ────────────────────────────────────────────
 * Aqui uma venda pode render dois documentos, e eles se somam: peça sai em
 * NFC-e/NF-e (imposto do estado) e mão de obra em NFS-e (imposto do município).
 * Ter um botão para cada um inchava a coluna de ações — que é uma fileira de
 * ícones — e, pior, numa entrega de OS só de mão de obra a tela ainda oferecia
 * a nota de mercadoria, que não tinha o que emitir.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 * Só aparece o que cabe naquela venda. E quando cabe UM documento só, este
 * componente sai da frente: desenha o botão daquele documento direto, como
 * sempre foi. O painel existe para responder "qual das duas?", então onde não
 * há pergunta ele não se intromete — e o caminho mais comum da loja (venda de
 * peça, sem serviço) não ganhou nenhum clique novo.
 *
 * ── Por que o painel FECHA antes de abrir o documento ────────────────────────
 * Cada botão de nota tem os próprios diálogos (escolher NF-e × NFC-e, ver a
 * nota, cancelar com justificativa). Abrir um deles por cima deste painel
 * empilharia modal sobre modal. Em vez disso o painel se fecha e manda abrir
 * pelo ref — o usuário vê uma transição, nunca duas caixas sobrepostas.
 */

type Props = {
  vendaId: number
  /** A venda tem peça? Vem da lista (`tem_produto`), não de consulta por linha. */
  temProduto: boolean
  /** A venda tem mão de obra? (`tem_servico`) */
  temServico: boolean
  aPrazo: boolean
  formaJaConhecida?: string | null
  clienteTipoPessoa?: 'fisica' | 'juridica' | null
  ehDono?: boolean
  notaMercadoria: NotaFiscalVenda | null
  notaServico: NotaServicoVenda | null
  onMudouMercadoria: (nota: NotaFiscalVenda | null) => void
  onMudouServico: (nota: NotaServicoVenda | null) => void
}

const ICONE_DO_ESTADO = {
  erro: { Icone: AlertTriangle, cor: 'text-red-600' },
  processando: { Icone: Clock, cor: 'text-amber-600' },
  completa: { Icone: Check, cor: 'text-emerald-600' },
  parcial: { Icone: Clock, cor: 'text-amber-600' },
  nenhuma: { Icone: FileText, cor: 'text-muted-foreground' }
} as const

const NotasDaVenda: FC<Props> = ({
  vendaId,
  temProduto,
  temServico,
  aPrazo,
  formaJaConhecida,
  clienteTipoPessoa,
  ehDono = false,
  notaMercadoria,
  notaServico,
  onMudouMercadoria,
  onMudouServico
}) => {
  const [painelAberto, setPainelAberto] = useState(false)
  const refMercadoria = useRef<GatilhoNota>(null)
  const refServico = useRef<GatilhoNota>(null)

  const cabem = documentosQueCabem({ temProduto, temServico })

  const notaFiscal = (
    <BotaoNotaFiscal
      ref={refMercadoria}
      vendaId={vendaId}
      aPrazo={aPrazo}
      formaJaConhecida={formaJaConhecida}
      clienteTipoPessoa={clienteTipoPessoa}
      ehDono={ehDono}
      nota={notaMercadoria}
      onMudou={onMudouMercadoria}
      semGatilho={cabem.length > 1}
    />
  )

  const notaDeServico = (
    <BotaoNotaServico
      ref={refServico}
      vendaId={vendaId}
      ehDono={ehDono}
      nota={notaServico}
      onMudou={onMudouServico}
      semGatilho={cabem.length > 1}
    />
  )

  // Venda sem item nenhum não existe na prática, mas se existir não há nota a
  // oferecer — melhor não desenhar nada do que um botão que só sabe falhar.
  if (cabem.length === 0) return null

  // Um documento só: o botão dele, direto. Sem painel, sem clique extra.
  if (cabem.length === 1) {
    return cabem[0] === 'mercadoria' ? notaFiscal : notaDeServico
  }

  const estado = estadoCombinado({
    temProduto,
    temServico,
    statusMercadoria: notaMercadoria?.status ?? null,
    statusServico: notaServico?.status ?? null
  })
  const { Icone, cor } = ICONE_DO_ESTADO[estado]

  const abrir = (doc: Documento) => {
    setPainelAberto(false)
    const alvo = doc === 'mercadoria' ? refMercadoria : refServico
    alvo.current?.abrir()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cor}
        onClick={() => setPainelAberto(true)}
        title={resumoDoEstado(estado, cabem)}
      >
        <Icone className="w-4 h-4" />
      </Button>

      {/* Os dois botões continuam montados, sem gatilho: é o ref deles que o
          painel aciona. Montados também porque são eles que guardam o estado
          da emissão — desmontar perderia um "processando" no meio do caminho. */}
      {notaFiscal}
      {notaDeServico}

      <Dialog open={painelAberto} onOpenChange={setPainelAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notas fiscais desta venda</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Esta venda teve peça e mão de obra. São <strong>dois documentos
            diferentes</strong>, e um não substitui o outro: a peça é tributada
            pelo estado e o serviço pelo município.
          </p>

          <div className="divide-y rounded-md border">
            <LinhaDocumento
              titulo="Mercadoria (peças)"
              estado={descreverMercadoria(notaMercadoria)}
              acao={rotuloMercadoria(notaMercadoria)}
              onAgir={() => abrir('mercadoria')}
            />
            <LinhaDocumento
              titulo="Serviço (mão de obra)"
              estado={descreverServico(notaServico)}
              acao={rotuloServico(notaServico)}
              onAgir={() => abrir('servico')}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

type LinhaProps = {
  titulo: string
  estado: { texto: string; Icone: typeof Landmark; cor: string }
  /** null = não há o que fazer com este documento agora. */
  acao: string | null
  onAgir: () => void
}

const LinhaDocumento: FC<LinhaProps> = ({ titulo, estado, acao, onAgir }) => (
  <div className="flex items-center gap-3 p-3">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">{titulo}</p>
      <p className={`text-xs flex items-center gap-1.5 ${estado.cor}`}>
        <estado.Icone className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{estado.texto}</span>
      </p>
    </div>
    {acao && (
      <Button variant="outline" size="sm" onClick={onAgir} className="shrink-0">
        {acao}
      </Button>
    )}
  </div>
)

// ── Como cada documento se descreve na linha ────────────────────────────────
// Texto curto e no vocabulário de quem lê: o dono não precisa saber o nome do
// status que o banco guarda.

function descreverMercadoria(nota: NotaFiscalVenda | null): LinhaProps['estado'] {
  if (!nota) return { texto: 'ainda não emitida', Icone: FileText, cor: 'text-muted-foreground' }
  switch (nota.status) {
    case 'autorizado':
      return {
        texto: `NFC-e nº ${nota.numero} autorizada`,
        Icone: Check,
        cor: 'text-emerald-600'
      }
    case 'pendente':
      return { texto: 'aguardando a SEFAZ', Icone: Clock, cor: 'text-amber-600' }
    case 'cancelado':
      return { texto: 'cancelada', Icone: FileText, cor: 'text-muted-foreground' }
    default:
      return { texto: 'não foi aceita', Icone: AlertTriangle, cor: 'text-red-600' }
  }
}

function descreverServico(nota: NotaServicoVenda | null): LinhaProps['estado'] {
  if (!nota) return { texto: 'ainda não emitida', Icone: Landmark, cor: 'text-muted-foreground' }
  switch (nota.status) {
    case 'autorizada':
      return {
        texto: `NFS-e ${nota.numero > 0 ? `nº ${nota.numero} ` : ''}autorizada`,
        Icone: Check,
        cor: 'text-emerald-600'
      }
    case 'processando':
      return { texto: 'aguardando a prefeitura', Icone: Clock, cor: 'text-amber-600' }
    case 'cancelada':
    case 'substituida':
      return { texto: nota.status, Icone: Landmark, cor: 'text-muted-foreground' }
    default:
      return { texto: 'não foi aceita', Icone: AlertTriangle, cor: 'text-red-600' }
  }
}

// O rótulo do botão diz o que vai acontecer. `null` some com o botão — nota
// cancelada não tem próximo passo, e um botão ali só convidaria a descobrir na
// marra que não faz nada.
function rotuloMercadoria(nota: NotaFiscalVenda | null): string | null {
  if (!nota) return 'Emitir'
  switch (nota.status) {
    case 'autorizado':
      return 'Ver'
    case 'pendente':
      return 'Verificar'
    case 'cancelado':
      return null
    default:
      return 'Ver motivo'
  }
}

function rotuloServico(nota: NotaServicoVenda | null): string | null {
  if (!nota) return 'Emitir'
  switch (nota.status) {
    case 'autorizada':
      return 'Ver'
    case 'processando':
      return 'Verificar'
    case 'cancelada':
    case 'substituida':
      return null
    default:
      return 'Ver motivo'
  }
}

export default NotasDaVenda
