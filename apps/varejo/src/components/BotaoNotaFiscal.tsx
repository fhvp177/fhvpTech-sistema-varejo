import { FC, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@fhvptech/core/ui/dialog'
import { AlertTriangle, Banknote, Check, Clock, CreditCard, FileText, Smartphone } from 'lucide-react'

// Botão de nota fiscal de UMA venda, na lista de vendas. Encapsula tudo —
// estado, modal de forma de pagamento e o acompanhamento do desfecho — pra não
// espalhar regra fiscal pela tela de Vendas, que é a mais crítica do sistema.
//
// Só existe no plano Pro: quem monta a lista carrega este componente atrás da
// flag __FEAT_NFE__, então no Básico ele nem entra no binário.
//
// REGRA DE OURO: emitir acontece DEPOIS da venda gravada. Se a SEFAZ recusar ou
// cair, a venda continua lá — o botão fica vermelho e dá pra tentar de novo.
// Nada aqui bloqueia o caixa.

type FormaPagamento = 'dinheiro' | 'debito' | 'credito' | 'pix' | 'crediario'

const FORMAS: { valor: FormaPagamento; rotulo: string; icone: FC<{ className?: string }> }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: Banknote },
  { valor: 'debito', rotulo: 'Cartão de débito', icone: CreditCard },
  { valor: 'credito', rotulo: 'Cartão de crédito', icone: CreditCard },
  { valor: 'pix', rotulo: 'PIX', icone: Smartphone }
]

type Props = {
  vendaId: number
  /** Vendas a prazo não perguntam a forma: é crediário por definição. */
  aPrazo: boolean
  nota: NotaFiscalVenda | null
  onMudou: (nota: NotaFiscalVenda | null) => void
}

const BotaoNotaFiscal: FC<Props> = ({ vendaId, aPrazo, nota, onMudou }) => {
  const [escolhendo, setEscolhendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const emitir = async (forma: FormaPagamento) => {
    setEscolhendo(false)
    setOcupado(true)
    const r = await window.api.fiscal.emitirNfce({ vendaId, formaPagamento: forma })
    if (!r.success) {
      setOcupado(false)
      setDetalhe(r.error)
      return
    }
    onMudou(r.data.nota)

    // A SEFAZ responde em segundos, mas não na mesma requisição. Faz uma
    // consulta rápida pra tirar a nota do "aguardando" sem o lojista ter que
    // recarregar a tela. Consultar status não custa crédito.
    if (r.data.nota?.status === 'pendente') {
      await new Promise((r) => setTimeout(r, 2500))
      const s = await window.api.fiscal.statusNfce({ vendaId })
      if (s.success) onMudou(s.data)
    }
    setOcupado(false)
  }

  const clicar = () => {
    if (ocupado) return
    // Nota que deu errado: mostra o motivo em vez de reemitir no susto.
    if (nota && ['rejeitado', 'denegado', 'erro'].includes(nota.status)) {
      setDetalhe(nota.motivo || 'A nota não foi aceita. Tente emitir novamente.')
      return
    }
    if (nota && nota.status === 'autorizado') {
      setDetalhe(
        `Nota nº ${nota.numero} autorizada.` + (nota.chave ? `\nChave: ${nota.chave}` : '')
      )
      return
    }
    if (nota && nota.status === 'pendente') {
      // Consulta o desfecho de uma nota que ficou pendente.
      setOcupado(true)
      window.api.fiscal.statusNfce({ vendaId }).then((s) => {
        setOcupado(false)
        if (s.success) onMudou(s.data)
      })
      return
    }
    // Sem nota ainda: a prazo já sabe a forma; à vista pergunta.
    if (aPrazo) emitir('crediario')
    else setEscolhendo(true)
  }

  const aparencia = () => {
    if (ocupado) return { Icone: Clock, cor: 'text-muted-foreground', titulo: 'Processando…' }
    if (!nota) return { Icone: FileText, cor: 'text-muted-foreground', titulo: 'Emitir nota fiscal' }
    switch (nota.status) {
      case 'autorizado':
        return { Icone: Check, cor: 'text-emerald-600', titulo: `Nota nº ${nota.numero} autorizada` }
      case 'pendente':
        return { Icone: Clock, cor: 'text-amber-600', titulo: 'Aguardando a SEFAZ — clique para verificar' }
      case 'cancelado':
        return { Icone: FileText, cor: 'text-muted-foreground', titulo: 'Nota cancelada' }
      default:
        return { Icone: AlertTriangle, cor: 'text-red-600', titulo: 'A nota não foi aceita' }
    }
  }

  const { Icone, cor, titulo } = aparencia()

  return (
    <>
      <Button variant="ghost" size="icon" className={cor} onClick={clicar} title={titulo}>
        <Icone className="w-4 h-4" />
      </Button>

      {/* Forma de pagamento — o dado que a nota exige e que a venda ainda não
          guardava. Quando o TEF for integrado, virá da própria maquininha. */}
      <Dialog open={escolhendo} onOpenChange={(a) => !a && setEscolhendo(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Como o cliente pagou?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            A nota fiscal precisa informar a forma de pagamento.
          </p>
          <div className="grid gap-2">
            {FORMAS.map((f) => (
              <Button
                key={f.valor}
                variant="outline"
                className="justify-start"
                onClick={() => emitir(f.valor)}
              >
                <f.icone className="w-4 h-4 mr-2 text-muted-foreground" />
                {f.rotulo}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Resultado / motivo da recusa */}
      <Dialog open={detalhe !== null} onOpenChange={(a) => !a && setDetalhe(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {nota?.status === 'autorizado' ? 'Nota fiscal' : 'A nota não foi emitida'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap break-words">{detalhe}</p>
          {nota && ['rejeitado', 'denegado', 'erro'].includes(nota.status) && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setDetalhe(null)
                  if (aPrazo) emitir('crediario')
                  else setEscolhendo(true)
                }}
              >
                Tentar novamente
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default BotaoNotaFiscal
