import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Eye, Trash2, Upload, Loader2 } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import { prepararComprovante, tamanhoLegivel } from '@/utils/comprovante'

type ResumoComprovante = {
  venda_id: number
  mime: string
  tamanho: number
  nome_arquivo: string | null
  anexado_por_nome: string | null
  anexado_em: string
}

type Props = {
  vendaId: number
  /** Só o dono apaga: comprovante é prova contra quem recebeu. */
  ehDono: boolean
  /** Venda cancelada não recebe anexo novo, mas o que já existe continua visível. */
  somenteLeitura?: boolean
}

const fmtQuando = (iso: string): string => {
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * O comprovante de pagamento de uma venda — quase sempre o print do PIX.
 *
 * ── O problema real ─────────────────────────────────────────────────────────
 * A peça sai para entrega e o cliente paga por PIX na porta. O entregador olha
 * o comprovante na tela do celular do cliente e vai embora: não fica prova
 * nenhuma. Quando o valor não aparece na conta, dias depois, é a palavra de um
 * contra a do outro — e a peça já foi.
 *
 * ── ⚠️ Sem `capture` no input, de propósito ─────────────────────────────────
 * `capture="environment"` forçaria a câmera e é o que parece certo à primeira
 * vista. Mas o caso comum não é fotografar um papel: é o print que o cliente
 * mandou pelo WhatsApp, já salvo na galeria. Com `capture`, esse print fica
 * inalcançável — o celular abre a câmera e não oferece mais nada.
 *
 * Só `accept="image/*"` deixa o próprio celular perguntar "câmera ou galeria?",
 * que atende os dois casos.
 */
const ComprovanteVenda: FC<Props> = ({ vendaId, ehDono, somenteLeitura = false }) => {
  const [resumo, setResumo] = useState<ResumoComprovante | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [vendo, setVendo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmar = useConfirm()

  const carregar = useCallback(async () => {
    setCarregando(true)
    const r = await window.api.comprovantes.resumo(vendaId)
    if (r.success) setResumo(r.data as ResumoComprovante | null)
    setCarregando(false)
  }, [vendaId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    // ⚠️ Zera o input SEMPRE: sem isto, escolher o mesmo arquivo duas vezes
    // seguidas não dispara `change` na segunda, e a tela fica parecendo travada.
    e.target.value = ''
    if (!arquivo) return

    setErro('')
    setEnviando(true)
    try {
      const preparado = await prepararComprovante(arquivo)
      const r = await window.api.comprovantes.anexar(vendaId, {
        mime: preparado.mime,
        dados: preparado.dados,
        nome_arquivo: preparado.nome_arquivo
      })
      if (!r.success) setErro(r.error)
      else await carregar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const ver = async () => {
    setErro('')
    const r = await window.api.comprovantes.obter(vendaId)
    if (!r.success) {
      setErro(r.error)
      return
    }
    const c = r.data as { mime: string; dados: string } | null
    if (!c) {
      setErro('O comprovante não está mais anexado.')
      await carregar()
      return
    }
    /*
     * ⚠️ O `mime` é conferido AQUI também, e não só na gravação.
     *
     * Isto vira o `src` de uma <img>. A gravação já valida, mas esta linha é o
     * que garante que um banco restaurado de um backup antigo — ou mexido por
     * fora — não consiga fazer a tela montar um data URI de outro tipo.
     */
    const mime = /^image\/(jpeg|png|webp)$/.test(c.mime) ? c.mime : 'image/jpeg'
    setVendo(`data:${mime};base64,${c.dados}`)
  }

  const remover = async () => {
    if (
      !(await confirmar({
        titulo: 'Remover comprovante',
        mensagem:
          'O comprovante desta venda será apagado e não há como recuperá-lo.\n\n' +
          'Ele é a prova de que o pagamento entrou. Deseja continuar?',
        variante: 'destructive'
      }))
    )
      return
    const r = await window.api.comprovantes.remover(vendaId)
    if (!r.success) setErro(r.error)
    else await carregar()
  }

  if (carregando) return null

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Comprovante de pagamento</span>

        {resumo ? (
          <span className="text-[12px] text-muted-foreground">
            {tamanhoLegivel(resumo.tamanho)}
            {resumo.anexado_por_nome ? ` · ${resumo.anexado_por_nome}` : ''} ·{' '}
            {fmtQuando(resumo.anexado_em)}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">
            {somenteLeitura ? 'Nenhum anexado.' : 'Anexe o print do PIX ou a foto do recibo.'}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {resumo && (
          <Button variant="outline" size="sm" onClick={ver}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Ver
          </Button>
        )}

        {!somenteLeitura && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={escolher}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              {enviando ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {enviando ? 'Enviando…' : resumo ? 'Trocar' : 'Anexar'}
            </Button>
          </>
        )}

        {resumo && ehDono && !somenteLeitura && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={remover}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remover
          </Button>
        )}
      </div>

      {erro && (
        <p className="mt-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {erro}
        </p>
      )}

      <Dialog open={vendo !== null} onOpenChange={(o) => !o && setVendo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovante da venda #{vendaId}</DialogTitle>
          </DialogHeader>
          {vendo && (
            /*
              `max-h` com rolagem: comprovante de banco é uma imagem alta e
              estreita, e sem teto ela empurraria o diálogo para fora da tela no
              celular — exatamente onde este recurso mais vai ser usado.
            */
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/30 p-2">
              <img src={vendo} alt="Comprovante de pagamento" className="mx-auto block" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ComprovanteVenda
