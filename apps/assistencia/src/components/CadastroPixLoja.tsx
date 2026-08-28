// Onde o lojista guarda a chave PIX que vira QR nos documentos com valor em
// aberto. Uma caixa de texto e um QR de teste — mas a prévia não é enfeite.
//
// ── Por que existe uma prévia pra escanear ───────────────────────────────────
//
// O risco deste recurso não é vazar a chave (chave PIX não é segredo; ela só
// serve pra receber). O risco é a chave estar ERRADA: um dígito trocado e todo
// cliente que escanear o cupom manda dinheiro pra um estranho — e ninguém
// descobre, porque o cupom sai bonito e o lojista só nota quando fecha o mês.
//
// Os dígitos verificadores de CPF/CNPJ pegam o dedo trocado, mas não provam que
// a chave é DELE. Só uma pessoa no mundo sabe disso: ele. Por isso a prévia
// mostra um QR de R$ 1,00 pra ser escaneado com o celular dele, ali na hora,
// antes de a chave valer pra valer. Se o nome que o banco mostrar não for o
// dele, a chave está errada.

import { FC } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'
import { QrCode, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  analisarChavePix,
  montarBrCodePix,
  ROTULO_TIPO_CHAVE,
  type TipoChavePix
} from '@fhvptech/core/lib/pixBrCode'

type Props = {
  chave: string
  tipo: TipoChavePix | ''
  nomeLoja: string
  cidadeLoja: string
  onChange: (campo: 'pix_chave' | 'pix_tipo', valor: string) => void
}

/** Valor do QR de teste. Baixo de propósito: é pra conferir, não pra pagar. */
const VALOR_DA_PREVIA = 1

const CadastroPixLoja: FC<Props> = ({ chave, tipo, nomeLoja, cidadeLoja, onChange }) => {
  const preenchida = chave.trim().length > 0
  const analise = preenchida ? analisarChavePix(chave, tipo || undefined) : null

  // A prévia usa os MESMOS dados que o cupom vai usar. Se ela não monta, o
  // cupom também não montaria — e é melhor o lojista descobrir isso aqui, com
  // o motivo escrito, do que no papel, em silêncio.
  const previa =
    analise?.ok === true
      ? montarBrCodePix({
          chave,
          tipo: tipo || undefined,
          beneficiario: nomeLoja,
          cidade: cidadeLoja,
          valor: VALOR_DA_PREVIA
        })
      : null

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <QrCode className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">Receber por PIX</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Com a chave preenchida, os documentos que ainda têm valor a receber saem com um QR
            code do seu PIX, já com o valor certo. O cliente aponta a câmera e paga.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <Label className="text-sm mb-1.5 block">Chave PIX</Label>
          <Input
            value={chave}
            onChange={(e) => onChange('pix_chave', e.target.value)}
            placeholder="CPF, CNPJ, celular, e-mail ou chave aleatória"
          />
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">Tipo</Label>
          <Select
            value={tipo}
            onChange={(v) => onChange('pix_tipo', v)}
            placeholder="Detectar sozinho"
            opcoes={[
              // CPF e celular têm os mesmos 11 dígitos. Quase sempre dá pra deduzir
              // pelos dígitos verificadores, mas quando não dá, quem decide é o dono
              // da chave.
              { valor: '', rotulo: 'Detectar sozinho' },
              ...(Object.keys(ROTULO_TIPO_CHAVE) as TipoChavePix[]).map((t) => ({
                valor: t,
                rotulo: ROTULO_TIPO_CHAVE[t]
              }))
            ]}
          />
        </div>
      </div>

      {analise && !analise.ok && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {analise.erro}
        </p>
      )}

      {analise?.ok === true && previa && !previa.ok && (
        // Chave boa, mas falta um dado da loja que o padrão do PIX exige. Sem
        // este aviso o lojista sairia achando que configurou, e nenhum cupom
        // sairia com QR — sem nada explicando por quê.
        <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {previa.erro}
        </p>
      )}

      {analise?.ok === true && previa?.ok === true && (
        <div className="border-t pt-3 flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <div className="bg-white p-2 rounded border shrink-0">
            <QRCodeSVG value={previa.payload} size={116} level="M" marginSize={2} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Chave válida ({ROTULO_TIPO_CHAVE[analise.tipo]})
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Confira antes de salvar:</strong> escaneie este QR com o seu celular. Ele é
              um teste de R$ 1,00 — não confirme o pagamento, só veja se o nome que aparece no
              app do banco é o seu. Se não for, a chave está errada e o dinheiro dos seus
              clientes iria para outra pessoa.
            </p>
          </div>
        </div>
      )}

      {!preenchida && (
        <p className="text-xs text-muted-foreground border-t pt-3">
          Sem chave preenchida, nenhum documento sai com QR — tudo continua como antes.
        </p>
      )}
    </div>
  )
}

export default CadastroPixLoja
