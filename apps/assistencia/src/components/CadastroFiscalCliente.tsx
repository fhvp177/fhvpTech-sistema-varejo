import { FC, useEffect, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'
import { Building2, ChevronDown, Search } from 'lucide-react'
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
// que o dono tenha à mão.

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

type Props = {
  /** Cliente sendo editado; null quando é cadastro novo (salva depois). */
  clienteId: number | null
  valor: FiscalCliente
  onChange: (v: FiscalCliente) => void
  /** CNPJ digitado no formulário do cliente — a busca na Receita parte dele. */
  cnpj?: string
  /**
   * Devolve ao formulário do cliente o que a Receita informou e que NÃO mora
   * aqui dentro (razão social, telefone, e-mail). Sem isto, o dono teria os
   * dados na tela e ainda assim digitaria a razão social à mão.
   */
  onDadosDaReceita?: (dados: { razao_social?: string; telefone?: string }) => void
}

const CadastroFiscalCliente: FC<Props> = ({
  clienteId,
  valor,
  onChange,
  cnpj,
  onDadosDaReceita
}) => {
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // Recolhido por padrão pra não esticar o modal do cliente. Quem for emitir
  // NF-e abre e preenche; pro resto (NFC-e) isso nem é necessário.
  const [aberta, setAberta] = useState(false)

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

  /**
   * Puxa o cadastro da empresa na base da Receita a partir do CNPJ.
   *
   * ⚠️ Cada consulta consome 0,1 crédito da conta fiscal (medido — saldo antes
   * e depois de uma chamada isolada). Por isso ela mora num BOTÃO, e não num
   * efeito que dispara enquanto o dono digita o CNPJ — autocompletar ao digitar
   * gastaria uma consulta por caractere.
   *
   * Diferente do "Buscar" do CEP, aqui os campos são SOBRESCRITOS: quem aperta
   * este botão está pedindo o dado oficial da Receita no lugar do que estiver
   * digitado. O que a consulta não trouxer é preservado.
   */
  const buscarPorCnpj = async () => {
    const limpo = soDigitos(cnpj ?? '')
    if (limpo.length !== 14) {
      setAviso('Preencha o CNPJ do cliente (14 números) antes de buscar.')
      return
    }
    setAviso(null)
    setBuscandoCnpj(true)
    const r = await window.api.fiscal.buscarCnpj(limpo)
    setBuscandoCnpj(false)
    if (!r.success) {
      setAviso(r.error)
      return
    }

    const e = r.data.endereco
    // O logradouro vem separado do tipo ("AVENIDA" + "PAULISTA"); juntamos como
    // a nota espera ler.
    const logradouro = [e?.tipo_logradouro, e?.logradouro].filter(Boolean).join(' ').trim()
    onChange({
      ...valor,
      endereco_logradouro: logradouro || valor.endereco_logradouro,
      endereco_numero: e?.numero || valor.endereco_numero,
      endereco_complemento: e?.complemento || valor.endereco_complemento,
      endereco_bairro: e?.bairro || valor.endereco_bairro,
      cidade: e?.municipio?.descricao || valor.cidade,
      uf: e?.uf || valor.uf,
      cep: soDigitos(e?.cep ?? '') || valor.cep,
      // O motivo de tudo isto: a NF-e exige o código IBGE e ninguém o decora.
      codigo_municipio: e?.municipio?.codigo_ibge || valor.codigo_municipio
    })

    const tel = r.data.telefones?.[0]
    onDadosDaReceita?.({
      razao_social: r.data.razao_social || undefined,
      telefone: tel ? `${tel.ddd}${tel.numero}` : undefined
    })

    // Empresa baixada/suspensa ainda emite nota? A SEFAZ recusa. Melhor o
    // dono saber agora do que na hora de faturar.
    const sit = r.data.situacao_cadastral
    setAviso(
      sit && !/ativa/i.test(sit.descricao ?? '')
        ? `Atenção: a Receita informa este CNPJ como "${sit.descricao}". Confira antes de emitir nota.`
        : `Dados de ${r.data.razao_social || 'empresa'} preenchidos.`
    )
  }

  // "Preenchido" = tem ao menos o município — vira o resumo do cabeçalho fechado.
  const preenchido = Boolean(valor.cidade || valor.endereco_logradouro || valor.codigo_municipio)

  return (
    <div className="rounded-md border bg-muted/10">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="text-sm font-medium flex items-center gap-2">
          Dados para nota fiscal (NF-e)
          <span className="text-xs font-normal text-muted-foreground">
            — {preenchido ? 'preenchido' : 'opcional'}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${
            aberta ? 'rotate-180' : ''
          }`}
        />
      </button>

      {aberta && (
        <div className="space-y-3 px-3 pb-3">
          <p className="text-xs text-muted-foreground">
            A NF-e exige o endereço completo do cliente. Preencha quando for emitir NF-e para
            este cliente — o CEP preenche cidade, estado e o código do município.
          </p>

          {/* Atalho principal: a Receita já tem tudo isto cadastrado. Fica em
              cima porque, quando funciona, dispensa o resto do formulário. */}
          <div className="rounded-md border border-dashed bg-background p-3 space-y-2">
            <p className="text-xs">
              <strong>Buscar na Receita Federal.</strong> Preenche razão social e endereço
              completo a partir do CNPJ digitado acima — inclusive o código do município, que a
              nota exige.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={buscarPorCnpj}
              disabled={buscandoCnpj}
            >
              <Building2 className="w-3.5 h-3.5 mr-1.5" />
              {buscandoCnpj ? 'Buscando…' : 'Buscar dados pelo CNPJ'}
            </Button>
          </div>

          <div className="flex gap-2 items-end">
        <div className="space-y-1.5 w-40">
          <Label htmlFor="cepCli">CEP</Label>
          {/* `unmask` faz o campo MOSTRAR "60000-000" e ENTREGAR "60000000".
              A máscara é do olho de quem digita; o que vai pro banco e pra nota
              continua sendo só dígito, como sempre foi. */}
          <IMaskInput
            id="cepCli"
            mask="00000-000"
            unmask
            inputMode="numeric"
            value={valor.cep}
            onAccept={(v: string) => alterar('cep', v)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                buscarCep()
              }
            }}
            placeholder="00000-000"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          <Select
            id="ufCli"
            value={valor.uf}
            onChange={(v) => alterar('uf', v)}
            placeholder="—"
            opcoes={[{ valor: '', rotulo: '—' }, ...UFS.map((u) => ({ valor: u.sigla, rotulo: u.sigla }))]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="indIe">Este cliente é…</Label>
          <Select
            id="indIe"
            value={valor.indicador_ie}
            onChange={(v) => alterar('indicador_ie', v)}
            opcoes={[
              { valor: '9', rotulo: 'Não contribuinte (não revende)' },
              { valor: '1', rotulo: 'Contribuinte de ICMS (revende)' },
              { valor: '2', rotulo: 'Isento de inscrição' }
            ]}
          />
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
      )}
    </div>
  )
}

export default CadastroFiscalCliente
