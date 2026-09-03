import { FC, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Select } from '@fhvptech/core/ui/select'
import { RefreshCw, Settings, Upload, Trash2, Store, ChevronDown, Sparkles, HardDriveDownload, Footprints, ShieldCheck, Users, Printer, MonitorSmartphone } from 'lucide-react'
import { IMaskInput } from 'react-imask'
import CadastroVendedores from '@/components/CadastroVendedores'
import ConfigComissao from '@/components/ConfigComissao'
import CadastroPixLoja from '@/components/CadastroPixLoja'
import ConfigSeguranca from '@/components/ConfigSeguranca'
import ConfigImpressao from '@/components/ConfigImpressao'
import ConfigMulticaixa from '@/components/ConfigMulticaixa'
import CidadeSeletor from '@/components/CidadeSeletor'
import SecaoConfig from '@/components/SecaoConfig'
import { useOnboarding, useNovidades, useTour, useLock } from '@/App'
import { obterDadosLoja, redimensionarLogo, type DadosLoja } from '@/utils/dadosLoja'
import type { EstadoMulticaixa } from '@/types/multicaixa'
import { useSituacaoMulticaixa } from '@/components/AvisoSemConexao'
import { UFS } from '@/data/ufs'

// Mesmo visual do <Input> do core — usado nos campos com máscara (IMaskInput
// renderiza o próprio <input>, então recebe as classes direto).
const CLASSE_INPUT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusBackup = {
  ativo: boolean
  ultimaAlteracao: string | null
  ultimoBackup: string | null
  falhasConsecutivas: number
  pastaPadrao: string
  pastaSecundaria: string
  frequencia: string
  aoFechar: string
  porVenda: boolean
  alertaTamanho: boolean
}

type Feedback = { tipo: 'ok' | 'erro'; msg: string }

type InfoAtualizacao = {
  versaoAtual: string
  ultimaVerificacao: string | null
  ultimaMensagem: string | null
  versaoBaixada: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtData = (iso: string | null) => {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

const Configuracoes: FC = () => {
  const { abrirGuia } = useOnboarding()
  const { abrirNovidades } = useNovidades()
  const { abrirTour } = useTour()
  const [infoAtualizacao, setInfoAtualizacao] = useState<InfoAtualizacao | null>(null)
  const [verificandoUpdate, setVerificandoUpdate] = useState(false)
  const [status, setStatus] = useState<StatusBackup | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [frequencia, setFrequencia] = useState('2')
  const [aoFechar, setAoFechar] = useState('perguntar')
  const [porVenda, setPorVenda] = useState(false)
  const [pastaPadrao, setPastaPadrao] = useState('')
  const [pastaSecundaria, setPastaSecundaria] = useState('')
  const [fazendoBackup, setFazendoBackup] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  // Feedback do backup manual mora DENTRO do card dele: "backup criado" é
  // resposta a uma AÇÃO, e não pode se misturar com o "salvo" das preferências
  // logo abaixo — foram duas mensagens no mesmo lugar que confundiram antes.
  const [feedbackBackup, setFeedbackBackup] = useState<Feedback | null>(null)

  // Dados da loja (identidade no cupom)
  const [loja, setLoja] = useState<DadosLoja | null>(null)
  // Resumos das seções fechadas — é o que permite ler a tela sem abrir nada.
  const { autoLockMinutos } = useLock()
  const [totalVendedores, setTotalVendedores] = useState<number | null>(null)
  const [estadoMulticaixa, setEstadoMulticaixa] = useState<EstadoMulticaixa | null>(null)
  const { ehCaixaAdicional } = useSituacaoMulticaixa()
  const [prefsImpressao, setPrefsImpressao] = useState<{
    cupom: { printer: string }
    documento: { printer: string }
  } | null>(null)
  const [salvandoLoja, setSalvandoLoja] = useState(false)
  const [feedbackLoja, setFeedbackLoja] = useState<Feedback | null>(null)
  const [erroLogo, setErroLogo] = useState('')
  const inputLogoRef = useRef<HTMLInputElement>(null)

  const carregarStatus = async () => {
    const resp = await window.api.backup.obterStatus()
    if (resp.success) {
      const s = resp.data as StatusBackup
      setStatus(s)
      setAtivo(s.ativo)
      setFrequencia(s.frequencia)
      setAoFechar(s.aoFechar)
      setPorVenda(s.porVenda)
      setPastaPadrao(s.pastaPadrao)
      setPastaSecundaria(s.pastaSecundaria)
    }
  }

  useEffect(() => { carregarStatus() }, [])

  useEffect(() => { obterDadosLoja().then(setLoja) }, [])
  // Dados que alimentam os resumos das seções fechadas.
  useEffect(() => {
    window.api.vendedores.listar().then((r) => {
      if (r.success) setTotalVendedores((r.data as unknown[]).length)
    })
    // Só para o resumo da seção recolhida — o componente de dentro recarrega
    // por conta própria quando o lojista mexe. No Básico o canal não existe.
    if (__FEAT_MULTICAIXA__) {
      window.api.multicaixa.estado().then((r) => {
        if (r.success) setEstadoMulticaixa(r.data)
      })
    }
    window.api.impressao.obterPreferencias().then((r) => {
      if (r.success) setPrefsImpressao(r.data)
    })
  }, [])

  const atualizarLoja = (campo: keyof DadosLoja, valor: string | boolean | null) =>
    setLoja((prev) => (prev ? { ...prev, [campo]: valor } : prev))

  const onSelecionarLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo depois
    if (!arquivo) return
    setErroLogo('')
    try {
      const dataUri = await redimensionarLogo(arquivo)
      // Ao subir uma logo, já liga a exibição (foi o que o usuário quis ao subir).
      setLoja((prev) => (prev ? { ...prev, logo: dataUri, exibir_logo: true } : prev))
    } catch (err) {
      setErroLogo((err as Error).message)
    }
  }

  const salvarLoja = async () => {
    if (!loja) return
    setSalvandoLoja(true)
    const r = await window.api.loja.salvar(loja)
    setSalvandoLoja(false)
    setFeedbackLoja(
      r.success
        ? { tipo: 'ok', msg: 'Dados da loja salvos! Já valem no próximo cupom.' }
        : { tipo: 'erro', msg: r.error }
    )
    setTimeout(() => setFeedbackLoja(null), 4000)
  }

  const carregarInfoAtualizacao = async (): Promise<void> => {
    const resp = await window.api.atualizacao.obterInfo()
    if (resp.success) setInfoAtualizacao(resp.data)
  }

  useEffect(() => {
    carregarInfoAtualizacao()
    // Atualiza o painel quando o autoUpdater emitir qualquer evento
    const off = window.api.atualizacao.onEvento(() => carregarInfoAtualizacao())
    return off
  }, [])

  const verificarAtualizacao = async (): Promise<void> => {
    setVerificandoUpdate(true)
    const resp = await window.api.atualizacao.verificar()
    if (!resp.success) mostrarFeedback('erro', resp.error)
    await carregarInfoAtualizacao()
    setVerificandoUpdate(false)
  }

  const instalarAtualizacao = async (): Promise<void> => {
    const resp = await window.api.atualizacao.instalar()
    if (!resp.success) mostrarFeedback('erro', resp.error)
  }

  const mostrarFeedback = (tipo: 'ok' | 'erro', msg: string) => {
    setFeedback({ tipo, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  /**
   * Grava uma preferência de backup na hora em que ela muda.
   *
   * ── Por que não existe mais botão de salvar ────────────────────────────────
   * Metade desta tela já salvava sozinha (escolher pasta, pasta secundária,
   * limpar), e a outra metade esperava um botão no rodapé. Quem mexia num
   * interruptor e saía da tela achava que tinha configurado — e não tinha.
   * Não era um botão faltando: eram duas regras convivendo na mesma tela, e a
   * pessoa não tem como saber qual vale para qual campo.
   *
   * A tela toda passa a seguir a regra que já valia para a maioria dos campos.
   *
   * ── O estado da tela anda ANTES da gravação ────────────────────────────────
   * O interruptor vira na hora e a gravação acontece atrás. Se ela falhar, o
   * valor volta para o que estava e o erro aparece — nunca fica um interruptor
   * ligado na tela e desligado no banco, que é o pior dos dois mundos.
   */
  const gravarPreferencia = async (
    chave: string,
    valor: string,
    desfazer: () => void
  ): Promise<void> => {
    try {
      const resp = await window.api.backup.gravarConfig(chave, valor)
      if (!resp.success) throw new Error(resp.error)
      mostrarFeedback('ok', 'Salvo.')
      await carregarStatus()
    } catch {
      desfazer()
      mostrarFeedback('erro', 'Não foi possível salvar. A opção voltou como estava.')
    }
  }

  const selecionarPasta = async () => {
    const resp = await window.api.backup.selecionarPasta()
    if (resp.success && resp.data) {
      const pasta = resp.data as string
      setPastaPadrao(pasta)
      await window.api.backup.gravarConfig('backup_pasta_padrao', pasta)
      mostrarFeedback('ok', 'Pasta primária atualizada!')
      await carregarStatus()
    } else if (!resp.success) {
      // Sem este ramo, o botão ficava mudo: clicar não abria nada e não dizia
      // nada. No aplicativo instalado isso quase nunca acontecia, então passou
      // despercebido; pelo navegador acontece sempre, porque uma página não
      // escolhe pasta do computador.
      mostrarFeedback('erro', resp.error)
    }
  }

  const selecionarPastaSecundaria = async () => {
    const resp = await window.api.backup.selecionarPasta()
    if (resp.success && resp.data) {
      const pasta = resp.data as string
      setPastaSecundaria(pasta)
      await window.api.backup.gravarConfig('backup_pasta_secundaria', pasta)
      mostrarFeedback('ok', 'Pasta secundária configurada!')
      await carregarStatus()
    } else if (!resp.success) {
      // Sem este ramo, o botão ficava mudo: clicar não abria nada e não dizia
      // nada. No aplicativo instalado isso quase nunca acontecia, então passou
      // despercebido; pelo navegador acontece sempre, porque uma página não
      // escolhe pasta do computador.
      mostrarFeedback('erro', resp.error)
    }
  }

  const limparPastaSecundaria = async () => {
    setPastaSecundaria('')
    await window.api.backup.gravarConfig('backup_pasta_secundaria', '')
    mostrarFeedback('ok', 'Espelho secundário removido.')
    await carregarStatus()
  }

  const fazerBackup = async () => {
    setFazendoBackup(true)
    setFeedbackBackup(null)
    const resp = await window.api.backup.fazerManual()
    setFazendoBackup(false)
    if (resp.success) {
      setFeedbackBackup({ tipo: 'ok', msg: 'Backup criado com sucesso!' })
      await carregarStatus()
    } else {
      setFeedbackBackup({
        tipo: 'erro',
        msg: `Falha no backup: ${(resp as { success: false; error: string }).error}`
      })
    }
    setTimeout(() => setFeedbackBackup(null), 4000)
  }

  // Textos curtos que aparecem ao lado do título quando a seção está fechada.
  const resumoSeguranca = `bloqueio em ${autoLockMinutos} min`
  const resumoVendedores =
    totalVendedores === null
      ? null
      : `${totalVendedores} ${totalVendedores === 1 ? 'cadastrado' : 'cadastrados'}`
  const impressoraCupom = prefsImpressao?.cupom?.printer
  const resumoImpressao = impressoraCupom || 'nenhuma escolhida'
  const resumoMulticaixa =
    estadoMulticaixa === null
      ? null
      : estadoMulticaixa.modo !== 'servidor'
        ? 'desligado'
        : `${estadoMulticaixa.terminais.length} ${estadoMulticaixa.terminais.length === 1 ? 'caixa conectado' : 'caixas conectados'}`

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="w-6 h-6 text-primary" />
        Configurações
      </h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Ajustes da loja. Tudo aqui salva sozinho — não existe botão de confirmar.
      </p>

      <SecaoConfig
        id="sistema"
        titulo="Sistema"
        icone={<Sparkles className="w-4 h-4" />}
        resumo={infoAtualizacao?.versaoAtual ? `versão ${infoAtualizacao.versaoAtual}` : null}
      >
        <div className="space-y-6">

        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">FHVP Tech — Sistema de Gestão</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Versão atual: <span className="font-mono font-semibold text-foreground">
                  {infoAtualizacao?.versaoAtual ?? '—'}
                </span>
              </p>
              {infoAtualizacao?.ultimaVerificacao && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Última verificação: {fmtData(infoAtualizacao.ultimaVerificacao)}
                </p>
              )}
              {infoAtualizacao?.ultimaMensagem && (
                <p className="text-xs text-muted-foreground mt-1.5 italic">
                  {infoAtualizacao.ultimaMensagem}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={verificarAtualizacao}
              disabled={verificandoUpdate}
              className="shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${verificandoUpdate ? 'animate-spin' : ''}`} />
              {verificandoUpdate ? 'Verificando...' : 'Verificar atualizações'}
            </Button>
          </div>
          {infoAtualizacao?.versaoBaixada && (
            <div className="border-t pt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-green-700">
                Atualização <span className="font-semibold">{infoAtualizacao.versaoBaixada}</span> pronta para instalar.
              </p>
              <Button size="sm" onClick={instalarAtualizacao}>
                Reiniciar e instalar
              </Button>
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4 bg-muted/30 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Novidades desta versão
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reveja o que melhorou na versão instalada do sistema.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={abrirNovidades} className="shrink-0">
            Ver novidades
          </Button>
        </div>

        <div className="border rounded-lg p-4 bg-muted/30 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Tutorial de boas-vindas
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reveja a apresentação do sistema e a lista de primeiros passos.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={abrirGuia} className="shrink-0">
            Ver novamente
          </Button>
        </div>

        <div className="border rounded-lg p-4 bg-muted/30 flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm flex items-center gap-1.5">
              <Footprints className="w-4 h-4 text-blue-600" /> Tour pelas telas
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Um passeio guiado pelo sistema de verdade: cada parada acende o botão certo e
              explica pra que ele serve.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={abrirTour} className="shrink-0">
            Fazer o tour
          </Button>
        </div>
        </div>
      </SecaoConfig>

      <SecaoConfig
        id="seguranca"
        titulo="Segurança"
        icone={<ShieldCheck className="w-4 h-4" />}
        resumo={resumoSeguranca}
      >
        <ConfigSeguranca />
      </SecaoConfig>

      {/* Dados da loja — mesma mecânica das demais (era um recolhível próprio,
          feito antes do componente existir). */}
      <SecaoConfig
        id="loja"
        titulo="Dados da loja"
        icone={<Store className="w-4 h-4" />}
        resumo={loja?.nome || null}
      >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nome, CNPJ e endereço que aparecem no cupom e no comprovante de devolução.
              A logo é opcional e pode ser exibida no topo dos cupons.
            </p>

            {loja && (
          <div className="space-y-4">
            {/* Logo */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                  {loja.logo ? (
                    <img src={loja.logo} alt="Logo da loja" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <Store className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={inputLogoRef}
                    type="file"
                    accept="image/*"
                    onChange={onSelecionarLogo}
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => inputLogoRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {loja.logo ? 'Trocar logo' : 'Enviar logo'}
                    </Button>
                    {loja.logo && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => atualizarLoja('logo', null)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG ou JPG. A imagem é reduzida automaticamente para caber no cupom.
                  </p>
                  {erroLogo && <p className="text-xs text-destructive">{erroLogo}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <p className="font-medium text-sm">Exibir logo nos cupons</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mostra a logo no topo do cupom e do comprovante de devolução.
                  </p>
                </div>
                <button
                  onClick={() => atualizarLoja('exibir_logo', !loja.exibir_logo)}
                  disabled={!loja.logo}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4 disabled:opacity-40 ${
                    loja.exibir_logo ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      loja.exibir_logo ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Campos de texto */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-sm mb-1.5 block">Nome da loja</Label>
                <Input
                  value={loja.nome}
                  onChange={(e) => atualizarLoja('nome', e.target.value)}
                  placeholder="Nome que aparece no cupom"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm mb-1.5 block">Razão social</Label>
                <Input
                  value={loja.razao_social}
                  onChange={(e) => atualizarLoja('razao_social', e.target.value)}
                  placeholder="Razão social (rodapé do cupom)"
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">CNPJ</Label>
                <IMaskInput
                  mask="00.000.000/0000-00"
                  value={loja.cnpj}
                  onAccept={(valor: string) => atualizarLoja('cnpj', valor)}
                  placeholder="00.000.000/0001-00"
                  className={CLASSE_INPUT}
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">Telefone</Label>
                <IMaskInput
                  mask={[{ mask: '(00) 0000-0000' }, { mask: '(00) 00000-0000' }]}
                  value={loja.telefone}
                  onAccept={(valor: string) => atualizarLoja('telefone', valor)}
                  placeholder="(00) 00000-0000"
                  className={CLASSE_INPUT}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm mb-1.5 block">Endereço</Label>
                <Input
                  value={loja.endereco}
                  onChange={(e) => atualizarLoja('endereco', e.target.value)}
                  placeholder="Rua, nº, bairro"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-sm mb-1.5 block">Cidade</Label>
                <CidadeSeletor
                  cidade={loja.cidade}
                  uf={loja.uf}
                  onDigitar={(valor) => atualizarLoja('cidade', valor)}
                  onSelecionar={(c, u) =>
                    setLoja((prev) => (prev ? { ...prev, cidade: c, uf: u } : prev))
                  }
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">UF</Label>
                <Select
                  value={loja.uf}
                  onChange={(v) => atualizarLoja('uf', v)}
                  placeholder="—"
                  opcoes={[
                    { valor: '', rotulo: '—' },
                    ...UFS.map((u) => ({ valor: u.sigla, rotulo: `${u.sigla} — ${u.nome}` }))
                  ]}
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">CEP</Label>
                <IMaskInput
                  mask="00000-000"
                  value={loja.cep}
                  onAccept={(valor: string) => atualizarLoja('cep', valor)}
                  placeholder="00000-000"
                  className={CLASSE_INPUT}
                />
              </div>
            </div>

            <CadastroPixLoja
              chave={loja.pix_chave}
              tipo={loja.pix_tipo}
              nomeLoja={loja.nome || loja.razao_social}
              cidadeLoja={loja.cidade}
              onChange={(campo, valor) => atualizarLoja(campo, valor)}
            />

            <div className="flex items-center gap-3">
              <Button onClick={salvarLoja} disabled={salvandoLoja}>
                {salvandoLoja ? 'Salvando...' : 'Salvar dados da loja'}
              </Button>
              {feedbackLoja && (
                <p className={`text-sm font-medium ${feedbackLoja.tipo === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
                  {feedbackLoja.msg}
                </p>
              )}
            </div>
          </div>
            )}
          </div>
      </SecaoConfig>

      <SecaoConfig
        id="vendedores"
        titulo="Vendedores"
        icone={<Users className="w-4 h-4" />}
        resumo={resumoVendedores}
      >
        <div className="space-y-4">
        <p className="text-sm text-muted-foreground -mt-1">
          Cadastre os vendedores da loja. Cada venda registra o vendedor que a realizou,
          permitindo acompanhar produção individual no histórico.
        </p>
        <ConfigComissao />
        <CadastroVendedores />
        </div>
      </SecaoConfig>

      <SecaoConfig
        id="impressao"
        titulo="Impressão"
        icone={<Printer className="w-4 h-4" />}
        resumo={resumoImpressao}
      >
        <div className="space-y-4">
        <p className="text-sm text-muted-foreground -mt-1">
          Escolha a impressora de cada tipo de documento. Marque "imprimir direto" para o
          cupom sair na hora, sem abrir a janela de impressão.
        </p>
        <ConfigImpressao />
        </div>
      </SecaoConfig>

      {__FEAT_MULTICAIXA__ && (
      <SecaoConfig
        id="multicaixa"
        titulo="Multicaixa"
        icone={<MonitorSmartphone className="w-4 h-4" />}
        resumo={resumoMulticaixa}
      >
        <div className="space-y-4">
        <p className="text-sm text-muted-foreground -mt-1">
          Permite que outro computador trabalhe nos mesmos dados desta loja, na rede local ou
          pela internet. Os dados continuam guardados apenas aqui.
        </p>
        <ConfigMulticaixa />
        </div>
      </SecaoConfig>
      )}

      {/* Backup fica ABERTO: é o único que o lojista vem CONSULTAR ("rodou?"),
          não configurar. Escondê-lo atrás de um clique pioraria a tela.

          Some por completo no caixa adicional: lá não existe banco para copiar,
          e os canais de backup já recusam. Mostrar botões que só respondem
          "indisponível" seria pior que não mostrar nada — quem é dono dos dados
          é o computador principal, e é lá que o backup se configura. */}
      {!ehCaixaAdicional && (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold border-b pb-2">Backup de Dados</h3>

        {/* Status */}
        {status && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <StatusCard label="Último backup" value={fmtData(status.ultimoBackup)} />
              <StatusCard label="Última alteração" value={fmtData(status.ultimaAlteracao)} />
            </div>
            {status.falhasConsecutivas > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
                ⚠ {status.falhasConsecutivas} falha(s) consecutiva(s) no backup automático.
              </div>
            )}
            {status.alertaTamanho && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-800">
                Atenção: pasta de backups está acima de 500 MB. Considere liberar espaço.
              </div>
            )}
          </div>
        )}

        {/* Toggle backup ativo */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium text-sm">Backup automático</p>
            <p className="text-xs text-muted-foreground mt-0.5">Habilita backups periódicos e ao fechar o sistema</p>
          </div>
          <button
            onClick={() => {
              const novo = !ativo
              setAtivo(novo)
              gravarPreferencia('backup_ativo', novo ? '1' : '0', () => setAtivo(ativo))
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ativo ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                ativo ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Frequência */}
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Frequência do backup automático</Label>
          <Select
            value={frequencia}
            onChange={(v) => {
              const anterior = frequencia
              setFrequencia(v)
              gravarPreferencia('backup_frequencia_horas', v, () => setFrequencia(anterior))
            }}
            classNameContainer="max-w-xs"
            opcoes={[
              { valor: '1', rotulo: 'A cada 1 hora' },
              { valor: '2', rotulo: 'A cada 2 horas' },
              { valor: '4', rotulo: 'A cada 4 horas' },
              { valor: '8', rotulo: 'A cada 8 horas' },
              { valor: '24', rotulo: 'A cada 24 horas' },
              { valor: 'desativado', rotulo: 'Desativado' }
            ]}
          />
        </div>

        {/* Backup a cada venda */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Fazer backup também a cada venda</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cria um backup em segundo plano após cada venda concluída. Mantém apenas os 30 mais recentes para não inchar o disco.
            </p>
          </div>
          <button
            onClick={() => {
              const novo = !porVenda
              setPorVenda(novo)
              gravarPreferencia('backup_por_venda', novo ? '1' : '0', () => setPorVenda(porVenda))
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ml-4 ${
              porVenda ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                porVenda ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Ao fechar */}
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Backup ao fechar o sistema</Label>
          <Select
            value={aoFechar}
            onChange={(v) => {
              const anterior = aoFechar
              setAoFechar(v)
              gravarPreferencia('backup_ao_fechar', v, () => setAoFechar(anterior))
            }}
            classNameContainer="max-w-xs"
            opcoes={[
              { valor: 'perguntar', rotulo: 'Perguntar se houve alterações' },
              { valor: 'sempre', rotulo: 'Sempre fazer automaticamente' },
              { valor: 'nunca', rotulo: 'Nunca' }
            ]}
          />
        </div>

        {/* Pasta padrão */}
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Pasta de backups</Label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={pastaPadrao}
              className="flex-1 h-10 rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground font-mono truncate"
            />
            <Button variant="outline" onClick={selecionarPasta}>
              Alterar...
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Subpastas são criadas automaticamente (diarios, semanais, mensais, manuais, etc.)
          </p>
        </div>

        {/* Pasta secundária (espelho) */}
        <div>
          <Label className="text-sm font-medium mb-1.5 block">
            Pasta secundária{' '}
            <span className="text-xs font-normal text-muted-foreground">(opcional — espelho de segurança)</span>
          </Label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={pastaSecundaria || 'Não configurada'}
              className={`flex-1 h-10 rounded-md border border-input px-3 py-2 text-sm font-mono truncate ${
                pastaSecundaria ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/60 italic'
              }`}
            />
            <Button variant="outline" onClick={selecionarPastaSecundaria}>
              {pastaSecundaria ? 'Alterar...' : 'Configurar...'}
            </Button>
            {pastaSecundaria && (
              <Button variant="outline" onClick={limparPastaSecundaria} className="text-destructive hover:text-destructive">
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cada backup criado é copiado automaticamente para esta pasta. Ideal para pen drive ou rede local.
          </p>
        </div>

        {/* Backup manual — é ação de BACKUP, então mora aqui na seção de backup,
            num card com cara própria (longe do rodapé, que é território do Salvar) */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-start gap-3">
            <HardDriveDownload className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-sm">Backup manual</h4>
              <p className="text-sm text-muted-foreground mt-0.5 mb-3">
                Cria um backup imediato salvo na pasta{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">manuais/</code>.
                Útil antes de operações importantes.
              </p>
              <div className="flex items-center gap-3">
                {/* Cor própria: é a única ação desta seção que FAZ alguma coisa
                    agora (as outras só guardam preferência). O contorno neutro
                    a deixava indistinguível de um campo a mais. */}
                <Button
                  onClick={fazerBackup}
                  disabled={fazendoBackup}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <HardDriveDownload className="w-4 h-4 mr-2" />
                  {fazendoBackup ? 'Criando backup...' : 'Fazer backup agora'}
                </Button>
                {feedbackBackup && (
                  <p className={`text-sm font-medium ${feedbackBackup.tipo === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
                    {feedbackBackup.msg}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sem botão de salvar: cada opção grava ao mudar (ver gravarPreferencia).
            O aviso do resultado fica aqui, no fim da seção, para não pular ao
            lado de cada controle a cada clique. */}
        {feedback && (
          <div className="border-t pt-4">
            <p className={`text-sm font-medium ${feedback.tipo === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {feedback.msg}
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// ─── Subcomponente ────────────────────────────────────────────────────────────

const StatusCard: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border rounded-lg p-3 bg-muted/30">
    <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
)

export default Configuracoes
