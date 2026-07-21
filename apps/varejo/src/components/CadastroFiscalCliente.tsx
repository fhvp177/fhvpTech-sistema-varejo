import { FC, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Search } from 'lucide-react'
import { UFS } from '@/data/ufs'

// Endereço e inscrição do cliente PESSOA JURÍDICA — o que a NF-e exige do
// destinatário. Só existe no plano Pro e só aparece quando o cliente é PJ:
// consumidor comum recebe NFC-e, que não pede nada disso.
//
// O endereço em texto livre do cadastro continua sendo o do cupom; estes campos
// são um conjunto à parte, para a nota. Mesmo desenho do endereço do emitente.
//
// A busca por CEP existe por um motivo específico: a nota exige o CÓDIGO IBGE
// do município, que ninguém sabe de cabeça e que não está em documento nenhum
// que o lojista tenha à mão.

const CLASSE_SELECT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

type Props = {
  /** Cliente sendo editado; null quando é cadastro novo (salva depois). */
  clienteId: number | null
  valor: FiscalCliente
  onChange: (v: FiscalCliente) => void
}

const CadastroFiscalCliente: FC<Props> = ({ clienteId, valor, onChange }) => {
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Ao abrir um cliente já existente, traz o que estiver salvo.
  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    window.api.fiscal.obterCliente(clienteId).then((r) => {
      if (vivo && r.success && r.data) onChange(r.data)
    })
    return () => {
      vivo = false
    }
    // Só quando troca de cliente — não a cada digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const alterar = <K extends keyof FiscalCliente>(campo: K, v: FiscalCliente[K]) =>
    onChange({ ...valor, [campo]: v })

  const buscarCep = async () => {
    const cep = soDigitos(valor.cep)
    if (cep.length !== 8) {
      setAviso('Digite o CEP completo (8 números).')
      return
    }
    setAviso(null)
    setBuscandoCep(true)
    const r = await window.api.fiscal.buscarCep(cep)
    setBuscandoCep(false)
    if (!r.success) {
      setAviso(r.error)
      return
    }
    // Preenche o que veio e guarda o código IBGE, que é o motivo da busca.
    onChange({
      ...valor,
      endereco_logradouro: r.data.logradouro || valor.endereco_logradouro,
      endereco_bairro: r.data.bairro || valor.endereco_bairro,
      cidade: r.data.municipio || valor.cidade,
      uf: r.data.uf || valor.uf,
      codigo_municipio: r.data.codigo_ibge || valor.codigo_municipio
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/10">
      <div>
        <p className="text-sm font-medium">Dados para nota fiscal</p>
        <p className="text-xs text-muted-foreground">
          A NF-e exige o endereço completo do cliente. Preencha quando for emitir nota para
          esta empresa — o CEP preenche o resto.
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <div className="space-y-1.5 w-40">
          <Label htmlFor="cepCli">CEP</Label>
          <Input
            id="cepCli"
            inputMode="numeric"
            maxLength={8}
            value={valor.cep}
            onChange={(e) => alterar('cep', soDigitos(e.target.value).slice(0, 8))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                buscarCep()
              }
            }}
            placeholder="Somente números"
          />
        </div>
        <Button type="button" variant="outline" onClick={buscarCep} disabled={buscandoCep}>
          <Search className="w-3.5 h-3.5 mr-1.5" />
          {buscandoCep ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {aviso && <p className="text-xs text-amber-700">{aviso}</p>}

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="logCli">Logradouro</Label>
          <Input
            id="logCli"
            value={valor.endereco_logradouro}
            onChange={(e) => alterar('endereco_logradouro', e.target.value)}
            placeholder="Rua, avenida…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="numCli">Número</Label>
          <Input
            id="numCli"
            value={valor.endereco_numero}
            onChange={(e) => alterar('endereco_numero', e.target.value)}
            placeholder="123"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bairroCli">Bairro</Label>
          <Input
            id="bairroCli"
            value={valor.endereco_bairro}
            onChange={(e) => alterar('endereco_bairro', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="compCli">
            Complemento <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <Input
            id="compCli"
            value={valor.endereco_complemento}
            onChange={(e) => alterar('endereco_complemento', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cidCli">Cidade</Label>
          <Input
            id="cidCli"
            value={valor.cidade}
            onChange={(e) => alterar('cidade', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ufCli">Estado</Label>
          <select
            id="ufCli"
            className={CLASSE_SELECT}
            value={valor.uf}
            onChange={(e) => alterar('uf', e.target.value)}
          >
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.sigla}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="indIe">Este cliente é…</Label>
          <select
            id="indIe"
            className={CLASSE_SELECT}
            value={valor.indicador_ie}
            onChange={(e) => alterar('indicador_ie', e.target.value)}
          >
            <option value="9">Não contribuinte (não revende)</option>
            <option value="1">Contribuinte de ICMS (revende)</option>
            <option value="2">Isento de inscrição</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Na dúvida, o contador do cliente sabe.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ieCli">
            Inscrição Estadual
            {valor.indicador_ie !== '1' && (
              <span className="text-muted-foreground font-normal"> (opcional)</span>
            )}
          </Label>
          <Input
            id="ieCli"
            inputMode="numeric"
            value={valor.inscricao_estadual}
            onChange={(e) => alterar('inscricao_estadual', soDigitos(e.target.value))}
            placeholder="Somente números"
          />
          {valor.indicador_ie === '1' && !valor.inscricao_estadual && (
            <p className="text-xs text-amber-700">
              Contribuinte de ICMS precisa informar a inscrição.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default CadastroFiscalCliente
