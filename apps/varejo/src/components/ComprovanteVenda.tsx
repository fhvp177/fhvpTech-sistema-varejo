import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Eye, Trash2, Upload, Loader2, Download } from 'lucide-react'
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
 * O `accept` sem `capture` deixa o próprio celular perguntar de onde vem o
 * arquivo, e atende os três caminhos: câmera, galeria e arquivos.
 *
 * ── ⚠️ Por que o PDF é mostrado EMBUTIDO, e não em outra aba ────────────────
 * No aplicativo instalado, abrir aba nova é desviado para o navegador do
 * sistema (`shell.openExternal`), e um endereço `blob:` só existe dentro da
 * página que o criou — a travessia o mataria, em silêncio. Embutido funciona
 * nos dois, porque quem desenha é o mesmo Chromium.
 *
 * O botão de baixar existe para o celular, onde o PDF embutido é irregular
 * (parte dos navegadores mostra em branco em vez de abrir o leitor).
 */
const ComprovanteVenda: FC<Props> = ({ vendaId, ehDono, somenteLeitura = false }) => {
  const [resumo, setResumo] = useState<ResumoComprovante | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [vendo, setVendo] = useState<{ url: string; ehPdf: boolean; nome: string } | null>(
    null
  )
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
    const ehPdf = c.mime === 'application/pdf'
    const mime = ehPdf
      ? 'application/pdf'
      : /^image\/(jpeg|png|webp)$/.test(c.mime)
        ? c.mime
        : 'image/jpeg'

    /*
     * ⚠️ PDF vira `blob:`, imagem continua `data:`.
     *
     * O Chromium recusa desenhar `data:application/pdf` dentro de um iframe —
     * é uma proteção antiga contra páginas que se disfarçam de documento. Com
     * `blob:` ele abre normalmente, no leitor embutido.
     *
     * Para imagem o `data:` continua sendo o caminho mais simples, e uma <img>
     * não sofre dessa restrição.
     */
    if (ehPdf) {
      const bin = atob(c.dados)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
      setVendo({ url, ehPdf: true, nome: resumo?.nome_arquivo || `comprovante-${vendaId}.pdf` })
      return
    }
    setVendo({
      url: `data:${mime};base64,${c.dados}`,
      ehPdf: false,
      nome: resumo?.nome_arquivo || `comprovante-${vendaId}.jpg`
    })
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
            {somenteLeitura
              ? 'Nenhum anexado.'
              : 'Anexe o print, a foto ou o PDF do comprovante.'}
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
              accept="image/*,application/pdf"
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

      <Dialog
        open={vendo !== null}
        onOpenChange={(o) => {
          if (o) return
          // ⚠️ Devolve o `blob:` ao fechar. Sem isto cada abertura de PDF deixa
          // uma cópia na memória da aba até a página ser recarregada.
          if (vendo?.ehPdf) URL.revokeObjectURL(vendo.url)
          setVendo(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovante da venda #{vendaId}</DialogTitle>
          </DialogHeader>
          {vendo && (
            <>
              {vendo.ehPdf && (
                <a
                  href={vendo.url}
                  download={vendo.nome}
                  className="inline-flex items-center gap-1.5 self-start rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar o PDF
                </a>
              )}
              {/*
                `max-h` com rolagem: comprovante de banco é alto e estreito, e
                sem teto empurraria o diálogo para fora da tela no celular —
                exatamente onde este recurso mais vai ser usado.
              */}
              <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/30 p-2">
                {vendo.ehPdf ? (
                  <iframe
                    src={vendo.url}
                    title="Comprovante de pagamento"
                    className="h-[65vh] w-full rounded"
                  />
                ) : (
                  <img src={vendo.url} alt="Comprovante de pagamento" className="mx-auto block" />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ComprovanteVenda
