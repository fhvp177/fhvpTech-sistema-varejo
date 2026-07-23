import { FC, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@fhvptech/core/ui/dialog'
import {
  AlertTriangle,
  Ban,
  Banknote,
  Check,
  Clock,
  CreditCard,
  FileText,
  Printer,
  Smartphone
} from 'lucide-react'
import { useImprimirPdf } from '@/components/ImpressaoProvider'

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
  /** Tipo de pessoa do cliente da venda; null quando é venda sem cliente. Decide
      a SUGESTÃO de documento (PJ → NF-e, consumidor → NFC-e) e se a NF-e é
      possível (venda de balcão sem cliente só emite NFC-e). */
  clienteTipoPessoa?: 'fisica' | 'juridica' | null
  nota: NotaFiscalVenda | null
  onMudou: (nota: NotaFiscalVenda | null) => void
  /** Cancelar nota é decisão do gerente — o vendedor emite, mas não desfaz. */
  ehDono?: boolean
}

const BotaoNotaFiscal: FC<Props> = ({
  vendaId,
  aPrazo,
  clienteTipoPessoa,
  nota,
  onMudou,
  ehDono = false
}) => {
  const imprimirPdf = useImprimirPdf()
  // NF-e precisa de um destinatário; venda sem cliente só pode NFC-e. E o
  // documento mais provável já vem marcado: empresa → NF-e, consumidor → NFC-e.
  const temCliente = clienteTipoPessoa === 'fisica' || clienteTipoPessoa === 'juridica'
  const sugestaoModelo: 55 | 65 = clienteTipoPessoa === 'juridica' ? 55 : 65

  const [escolhendo, setEscolhendo] = useState(false)
  const [modeloEscolhido, setModeloEscolhido] = useState<55 | 65>(sugestaoModelo)
  const [formaEscolhida, setFormaEscolhida] = useState<FormaPagamento | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [aberta, setAberta] = useState(false) // painel da nota autorizada
  const [cancelando, setCancelando] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [erroCancelar, setErroCancelar] = useState<string | null>(null)

  // Abre a escolha de documento + forma, sempre pré-marcada no mais provável.
  const abrirEscolha = () => {
    setModeloEscolhido(sugestaoModelo)
    setFormaEscolhida(null)
    setEscolhendo(true)
  }

  const confirmarEmissao = () => {
    // A prazo não pergunta forma — é crediário por definição. À vista usa a
    // que o lojista marcou (o botão só habilita depois de marcar).
    emitir(modeloEscolhido, aPrazo ? 'crediario' : (formaEscolhida as FormaPagamento))
  }

  const emitir = async (modelo: 55 | 65, forma: FormaPagamento) => {
    setEscolhendo(false)
    setOcupado(true)
    const r = await window.api.fiscal.emitirNfce({ vendaId, formaPagamento: forma, modelo })
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
      setAberta(true)
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
    // Sem nota ainda: escolhe o documento (e a forma de pagamento, se à vista).
    abrirEscolha()
  }

  // DANFE: o "cupom" com valor fiscal que o cliente leva. Sai na mesma
  // impressora térmica do cupom comum, e baixar não custa crédito — reimprimir
  // é de graça.
  const imprimirDanfe = async () => {
    setOcupado(true)
    const r = await window.api.fiscal.danfe({ vendaId })
    setOcupado(false)
    if (!r.success) {
      setDetalhe(r.error)
      return
    }
    setAberta(false)
    // A NFC-e sai na térmica (bobina), como o cupom. A NF-e é A4 e vai pra
    // impressora de documentos — mandar as duas pro mesmo lugar faria a NF-e
    // sair cortada na bobina.
    const ehNfe = nota?.modelo === 55
    await imprimirPdf(
      r.data.pdfBase64,
      `${ehNfe ? 'nfe' : 'danfe'}-${r.data.numero}`,
      ehNfe ? 'documento' : 'cupom'
    )
  }

  const cancelar = async () => {
    setErroCancelar(null)
    if (justificativa.trim().length < 15) {
      setErroCancelar('A justificativa precisa ter pelo menos 15 caracteres.')
      return
    }
    setOcupado(true)
    const r = await window.api.fiscal.cancelarNfce({ vendaId, justificativa: justificativa.trim() })
    setOcupado(false)
    if (!r.success) {
      setErroCancelar(r.error)
      return
    }
    setCancelando(false)
    setAberta(false)
    setJustificativa('')
    onMudou(r.data)
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

      {/* Escolha do documento (NF-e × NFC-e) e, à vista, da forma de pagamento —
          o dado que a nota exige e que a venda ainda não guardava. Quando o TEF
          for integrado, a forma virá da própria maquininha. */}
      <Dialog open={escolhendo} onOpenChange={(a) => !a && setEscolhendo(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Emitir documento fiscal</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Que documento emitir?</p>
            {temCliente ? (
              <div className="grid gap-2">
                {([65, 55] as const).map((m) => {
                  const marcado = modeloEscolhido === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModeloEscolhido(m)}
                      className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left text-sm transition-colors ${
                        marcado ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          marcado ? 'border-primary' : 'border-muted-foreground'
                        }`}
                      >
                        {marcado && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span>
                        <span className="font-medium">
                          {m === 65 ? 'NFC-e — cupom' : 'NF-e — nota A4'}
                          {m === sugestaoModelo && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              sugerido
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m === 65
                            ? 'Consumidor — sai na impressora térmica.'
                            : 'Empresa — em folha A4.'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Venda sem cliente sai como <strong>NFC-e</strong> (cupom). Para emitir NF-e, a
                venda precisa ter um cliente identificado.
              </p>
            )}
          </div>

          {!aPrazo && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Como o cliente pagou?</p>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS.map((f) => (
                  <Button
                    key={f.valor}
                    variant={formaEscolhida === f.valor ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setFormaEscolhida(f.valor)}
                  >
                    <f.icone className="w-4 h-4 mr-2" />
                    {f.rotulo}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEscolhendo(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarEmissao} disabled={!aPrazo && !formaEscolhida}>
              Emitir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nota autorizada: imprimir o DANFE e, pro gerente, cancelar */}
      <Dialog
        open={aberta}
        onOpenChange={(a) => {
          if (!a) {
            setAberta(false)
            setCancelando(false)
            setErroCancelar(null)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nota fiscal nº {nota?.numero}</DialogTitle>
          </DialogHeader>

          {nota?.chave && (
            <div>
              <p className="text-xs text-muted-foreground">Chave de acesso</p>
              <p className="text-xs font-mono break-all">{nota.chave}</p>
            </div>
          )}

          {!cancelando ? (
            <div className="grid gap-2">
              <Button onClick={imprimirDanfe} disabled={ocupado}>
                <Printer className="w-4 h-4 mr-2" />
                {ocupado ? 'Preparando…' : 'Imprimir nota'}
              </Button>
              {ehDono && (
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setCancelando(true)}
                  disabled={ocupado}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Cancelar nota
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  O cancelamento só é aceito dentro do prazo legal (geralmente 30 minutos
                  após a autorização) e fica registrado na SEFAZ.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="just">Por que está cancelando?</Label>
                <Input
                  id="just"
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ex.: cliente desistiu da compra"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 15 caracteres — exigência da SEFAZ.{' '}
                  <span className="tabular-nums">{justificativa.trim().length}/15</span>
                </p>
              </div>
              {erroCancelar && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>{erroCancelar}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCancelando(false)} disabled={ocupado}>
                  Voltar
                </Button>
                <Button
                  onClick={cancelar}
                  disabled={ocupado || justificativa.trim().length < 15}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {ocupado ? 'Cancelando…' : 'Confirmar cancelamento'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resultado / motivo da recusa */}
      <Dialog open={detalhe !== null} onOpenChange={(a) => !a && setDetalhe(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>A nota não foi emitida</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap break-words">{detalhe}</p>
          {nota && ['rejeitado', 'denegado', 'erro'].includes(nota.status) && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setDetalhe(null)
                  abrirEscolha()
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
