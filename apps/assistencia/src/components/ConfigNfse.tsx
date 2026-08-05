import { FC, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Landmark, Loader2, Search, Wrench } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'

/**
 * Habilitação da NFS-e — a nota do SERVIÇO.
 *
 * A ordem das coisas nesta tela não é estética, é economia do tempo do lojista:
 *
 * 1. **A cidade é atendida?** Vem primeiro porque é a única pergunta cuja
 *    resposta "não" torna todo o resto inútil. NFC-e é padrão nacional e
 *    funciona em qualquer município; NFS-e depende de a prefeitura ter provedor
 *    integrado, e cidade pequena muitas vezes não tem. Descobrir isso DEPOIS de
 *    o cliente correr atrás de Inscrição Municipal e alíquotas com o contador
 *    seria queimá-lo à toa.
 *
 * 2. **Os dados da prefeitura.** Inscrição Municipal e série do RPS — números
 *    que só a prefeitura informa.
 *
 * 3. **A numeração.** O campo mais perigoso da tela, e por isso o mais
 *    explicado: quem vem de outro sistema tem que CONTINUAR a numeração, senão
 *    a prefeitura recusa RPS repetido.
 */

type Props = {
  config: ConfigFiscal
  /** Salva a config local (mesmo handler do resto da tela). */
  onSalvar: (parcial: Partial<ConfigFiscal>) => Promise<boolean>
  /** Passo 1 concluído — sem ele não há CNPJ nem município pra consultar. */
  passo1Feito: boolean
  /** Empresa cadastrada na ACBr e certificado enviado. */
  empresaPronta: boolean
}

const ConfigNfse: FC<Props> = ({ config, onSalvar, passo1Feito, empresaPronta }) => {
  const [im, setIm] = useState(config.inscricao_municipal)
  const [serie, setSerie] = useState(config.nfse_serie_rps)
  const [proximo, setProximo] = useState(String(config.nfse_proximo_rps))
  const [lote, setLote] = useState(String(config.nfse_lote))
  const [optante, setOptante] = useState(config.nfse_optante_simples)
  const [issRetido, setIssRetido] = useState(config.nfse_iss_retido)

  const [consultando, setConsultando] = useState(false)
  const [habilitando, setHabilitando] = useState(false)
  const [erro, setErro] = useState('')
  const [pendentes, setPendentes] = useState<{
    total_servicos: number
    servicos_pendentes: number
    exemplos: Array<{ id: number; nome: string }>
  } | null>(null)

  const carregarPendentes = useCallback(async () => {
    const r = await window.api.fiscal.diagnosticoNfse()
    if (r.success) setPendentes(r.data)
  }, [])

  useEffect(() => {
    carregarPendentes()
  }, [carregarPendentes])

  const consultarCidade = async () => {
    setConsultando(true)
    setErro('')
    const r = await window.api.fiscal.consultarCidadeNfse()
    setConsultando(false)
    if (!r.success) setErro(r.error)
  }

  const habilitar = async () => {
    setErro('')
    // Grava a config local antes de mandar pra ACBr: o handler do backend lê do
    // banco, não do formulário.
    const salvou = await onSalvar({
      inscricao_municipal: im,
      nfse_serie_rps: serie,
      nfse_proximo_rps: Number(proximo) || 1,
      nfse_lote: Number(lote) || 1,
      nfse_optante_simples: optante,
      nfse_iss_retido: issRetido
    })
    if (!salvou) return

    setHabilitando(true)
    const r = await window.api.fiscal.configurarNfse()
    setHabilitando(false)
    if (!r.success) setErro(r.error)
  }

  if (!passo1Feito) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Conclua o passo 1 (dados da empresa) antes desta etapa.</p>
      </div>
    )
  }

  const naoAtendida = config.nfse_cidade_atendida === 'nao'
  const atendida = config.nfse_cidade_atendida === 'sim'

  return (
    <div className="space-y-4">
      {/* ── 1. Cobertura do município ─────────────────────────────────────── */}
      <div className="rounded-md border px-3 py-3 space-y-2">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Landmark className="w-4 h-4 text-muted-foreground" />A sua prefeitura emite nota de
          serviço pelo sistema?
        </p>
        <p className="text-xs text-muted-foreground">
          Diferente da nota de mercadoria, que vale em todo o Brasil, a nota de serviço é
          municipal — e nem toda prefeitura permite emitir por outro sistema. Vale conferir isto
          antes de procurar o contador.
        </p>

        {atendida && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Sua cidade é atendida
              {config.nfse_provedor ? ` (sistema da prefeitura: ${config.nfse_provedor})` : ''}.
              Pode seguir para os dados abaixo.
            </p>
          </div>
        )}

        {naoAtendida && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                <strong>A prefeitura da sua cidade ainda não é atendida.</strong> A nota de
                serviço vai continuar sendo emitida pelo site da prefeitura, como você já faz
                hoje.
              </p>
              <p>
                Isso não afeta em nada a nota de mercadoria (NFC-e e NF-e), que segue funcionando
                normalmente aqui no sistema.
              </p>
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" onClick={consultarCidade} disabled={consultando}>
          {consultando ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5 mr-1.5" />
          )}
          {config.nfse_cidade_atendida === '' ? 'Consultar minha cidade' : 'Consultar de novo'}
        </Button>
      </div>

      {/* ── 2 e 3. Dados da prefeitura + numeração ────────────────────────── */}
      {!naoAtendida && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm mb-1.5 block">Inscrição Municipal</Label>
              <Input
                value={im}
                onChange={(e) => setIm(e.target.value)}
                placeholder="o número do cadastro da empresa na prefeitura"
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Série do RPS</Label>
              <Input
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder="ex.: 1 ou A — quem define é a prefeitura"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm mb-1.5 block">Próximo número de RPS</Label>
              <Input
                value={proximo}
                inputMode="numeric"
                onChange={(e) => setProximo(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Lote</Label>
              <Input
                value={lote}
                inputMode="numeric"
                onChange={(e) => setLote(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          {/* O aviso que evita o erro mais caro desta tela. */}
          <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>Se você já emitia nota de serviço por outro sistema</strong>, continue a
              numeração de onde ele parou: informe aqui o número seguinte ao da última nota
              emitida. A prefeitura recusa uma nota com número que já foi usado.
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={optante}
                onChange={(e) => setOptante(e.target.checked)}
                className="rounded border-input"
              />
              A empresa é optante pelo Simples Nacional
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={issRetido}
                onChange={(e) => setIssRetido(e.target.checked)}
                className="rounded border-input"
              />
              O ISS é retido pelo cliente (confirme com o seu contador)
            </label>
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{erro}</p>
            </div>
          )}

          <Button onClick={habilitar} disabled={habilitando || !empresaPronta}>
            {habilitando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {config.nfse_configurada ? 'Salvar e reenviar' : 'Habilitar nota de serviço'}
          </Button>
          {!empresaPronta && (
            <p className="text-xs text-muted-foreground">
              Cadastre a empresa e envie o certificado (passos 1 e 2) antes de habilitar.
            </p>
          )}
          {config.nfse_configurada && (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Nota de serviço habilitada.
            </p>
          )}

          {/* ── 4. Serviços sem classificação ─────────────────────────────── */}
          {pendentes && pendentes.total_servicos > 0 && (
            <div className="rounded-md border px-3 py-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Classificação dos serviços
              </p>
              {pendentes.servicos_pendentes === 0 ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Todos os {pendentes.total_servicos} serviços já estão classificados.
                </p>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>
                      <strong>{pendentes.servicos_pendentes}</strong> de {pendentes.total_servicos}{' '}
                      {pendentes.servicos_pendentes === 1 ? 'serviço ainda está' : 'serviços ainda estão'}{' '}
                      sem o código da lista de serviços ou sem a alíquota de ISS, e não{' '}
                      {pendentes.servicos_pendentes === 1 ? 'poderá' : 'poderão'} sair em nota.
                    </p>
                    <p>
                      Esses dois números vêm do <strong>seu contador</strong> — o sistema não
                      preenche sozinho de propósito, porque item errado muda o imposto. Preencha
                      em <strong>Produtos e Serviços</strong>, abrindo cada serviço.
                    </p>
                    {pendentes.exemplos.length > 0 && (
                      <p className="opacity-80">
                        Faltando: {pendentes.exemplos.map((e) => e.nome).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ConfigNfse
