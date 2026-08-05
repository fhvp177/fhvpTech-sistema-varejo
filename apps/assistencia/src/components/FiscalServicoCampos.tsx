import { FC, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Landmark } from 'lucide-react'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'

/**
 * Classificação fiscal de um SERVIÇO, dentro do cadastro de Produtos e Serviços.
 *
 * É o gêmeo do FiscalProdutoCampos, mas os campos são outros porque o imposto é
 * outro: mercadoria é tributada pelo estado (NCM, CFOP, CSOSN); serviço é
 * tributado pelo município (item da lista da LC 116 e alíquota de ISS).
 *
 * Fica recolhido por padrão, mostrando no cabeçalho o que já está preenchido —
 * quem cadastra um serviço no dia a dia não quer ver campo de imposto, e quem
 * está sentado com o contador abre uma vez e resolve todos.
 */

type Props = {
  /** Serviço em edição; null quando é cadastro novo (salva depois de criar). */
  servicoId: number | null
  valor: FiscalServico
  onChange: (v: FiscalServico) => void
}

const FiscalServicoCampos: FC<Props> = ({ servicoId, valor, onChange }) => {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!servicoId) return
    let vivo = true
    window.api.fiscal.obterServico(servicoId).then((r) => {
      if (vivo && r.success && r.data) onChange(r.data)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicoId])

  const alterar = <K extends keyof FiscalServico>(campo: K, v: FiscalServico[K]) =>
    onChange({ ...valor, [campo]: v })

  const preenchido = Boolean(valor.item_lista_servico.trim() && valor.aliquota_iss.trim())

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {aberto ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <Landmark className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">Nota de serviço</span>
        <span className="text-xs text-muted-foreground ml-auto truncate">
          {preenchido
            ? `${valor.item_lista_servico} · ISS ${valor.aliquota_iss}%`
            : 'sem classificação — não sai em nota'}
        </span>
      </button>

      {aberto && (
        <div className="border-t p-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Estes dois números vêm do seu contador e valem para este serviço. Sem eles a
            prefeitura recusa a nota — o sistema não preenche sozinho porque item errado muda o
            imposto que você paga.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm mb-1.5 block">Item da lista de serviços</Label>
              <Input
                value={valor.item_lista_servico}
                onChange={(e) => alterar('item_lista_servico', e.target.value)}
                placeholder="ex.: 14.02"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Da Lei Complementar 116. Assistência técnica costuma ser 14.01 ou 14.02.
              </p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Alíquota de ISS (%)</Label>
              <Input
                value={valor.aliquota_iss}
                inputMode="decimal"
                onChange={(e) =>
                  // Aceita vírgula (como o lojista digita) e só dígitos/separador.
                  alterar('aliquota_iss', e.target.value.replace(/[^\d.,]/g, ''))
                }
                placeholder="ex.: 5"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Em porcentagem: digite 5 para 5%.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm mb-1.5 block">
                Código de tributação do município{' '}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                value={valor.codigo_tributacao_municipio}
                onChange={(e) => alterar('codigo_tributacao_municipio', e.target.value)}
                placeholder="só se a sua prefeitura exigir"
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">
                CNAE <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                value={valor.codigo_cnae}
                onChange={(e) => alterar('codigo_cnae', e.target.value.replace(/\D/g, ''))}
                placeholder="ex.: 9511800"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FiscalServicoCampos
