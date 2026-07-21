import { FC, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  AlertTriangle,
  Building2,
  Check,
  FileText,
  KeyRound,
  Lock,
  Package,
  Save,
  ShieldCheck
} from 'lucide-react'
import { obterDadosLoja, type DadosLoja } from '@/utils/dadosLoja'
import {
  apenasDigitos,
  formatoEsperadoIE,
  maxDigitosIE,
  validarEmail,
  validarInscricaoEstadual,
  validarRegime,
  validarSerie
} from '@/utils/validacaoFiscal'

// Tela de habilitação da nota fiscal (NFC-e). Só existe no plano Pro
// (__FEAT_NFE__) e só o dono entra.
//
// A ideia central: o lojista descobre o que falta SENTADO, com calma, e não com
// o cliente esperando no balcão. Por isso a tela é um checklist do caminho
// inteiro — inclusive dos passos que ainda não dá pra executar. Ver o que vem
// pela frente é o que permite ele já ir atrás do certificado e do CSC, que
// dependem de terceiros (certificadora, contador, SEFAZ) e demoram dias.
//
// Onde a tela é honesta de propósito: nos campos de JULGAMENTO fiscal (NCM,
// CFOP, CST/CSOSN) ela manda perguntar ao contador em vez de fingir que é só
// preencher. Lojista não sabe o NCM de uma blusa; se puser um campo em branco
// na frente dele, ele chuta — e nota com NCM errado é autorizada pela SEFAZ e
// vira passivo dele numa fiscalização, meses depois.

const ClassificacaoFiscal = lazy(() => import('@/components/ClassificacaoFiscal'))

type Feedback = { tipo: 'ok' | 'erro'; msg: string }

type EstadoPasso = 'ok' | 'pendente' | 'bloqueado'

const REGIMES: { valor: '1' | '2' | '3'; rotulo: string }[] = [
  { valor: '1', rotulo: 'Simples Nacional' },
  { valor: '2', rotulo: 'Simples Nacional — excesso de sublimite' },
  { valor: '3', rotulo: 'Regime Normal (Lucro Presumido ou Real)' }
]

const CLASSE_SELECT =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

// Erro só aparece depois que o campo foi visitado — ninguém gosta de abrir a
// tela e já encontrar tudo vermelho.
const Erro: FC<{ mostrar: boolean; texto: string | null }> = ({ mostrar, texto }) =>
  mostrar && texto ? (
    <p className="text-xs text-red-600 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {texto}
    </p>
  ) : null

// ISO → "12/03/2027". Vazio quando a data não faz sentido.
function formatarData(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Caixa de erro vermelha reutilizada pelos passos de rede (certificado, CSC).
const ErroAcao: FC<{ texto: string | null }> = ({ texto }) =>
  texto ? (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <p>{texto}</p>
    </div>
  ) : null

// Aviso mostrado nos passos 2/3 enquanto o passo 1 não foi concluído.
const CompleteOPasso1: FC = () => (
  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
    <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
    <p>Conclua o passo 1 (dados da empresa) antes desta etapa.</p>
  </div>
)

// Linha do semáforo: verde quando resolvido, âmbar quando falta.
const ItemCheck: FC<{ ok: boolean; texto: string }> = ({ ok, texto }) => (
  <div className="flex items-center gap-2 text-sm">
    {ok ? (
      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
    )}
    <span className={ok ? '' : 'text-amber-800'}>{texto}</span>
  </div>
)

const Passo: FC<{
  numero: number
  titulo: string
  descricao: string
  estado: EstadoPasso
  icone: FC<{ className?: string }>
  children?: React.ReactNode
}> = ({ numero, titulo, descricao, estado, icone: Icone, children }) => {
  const cores: Record<EstadoPasso, string> = {
    ok: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pendente: 'bg-amber-100 text-amber-700 border-amber-200',
    bloqueado: 'bg-slate-100 text-slate-500 border-slate-200'
  }
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-start gap-3 p-4 bg-muted/20">
        <div
          className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 text-sm font-semibold ${cores[estado]}`}
        >
          {estado === 'ok' ? <Check className="w-4 h-4" /> : numero}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm flex items-center gap-1.5">
            <Icone className="w-4 h-4 text-muted-foreground" />
            {titulo}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
        </div>
      </div>
      {children && <div className="p-4 border-t space-y-4">{children}</div>}
    </div>
  )
}


const ConfiguracaoFiscal: FC = () => {
  const [config, setConfig] = useState<ConfigFiscal | null>(null)
  const [diagnostico, setDiagnostico] = useState<DiagnosticoFiscal | null>(null)
  const [loja, setLoja] = useState<DadosLoja | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [tocados, setTocados] = useState<Record<string, boolean>>({})

  // Passo 2 (certificado) e passo 3 (CSC): ação de rede em curso e campos.
  const [enviando, setEnviando] = useState<null | 'certificado' | 'csc'>(null)
  const [senhaCert, setSenhaCert] = useState('')
  const [arquivoCert, setArquivoCert] = useState<{ nome: string; base64: string } | null>(null)
  const [erroCert, setErroCert] = useState<string | null>(null)
  const [csc, setCsc] = useState('')
  const [idCsc, setIdCsc] = useState('')
  const [erroCsc, setErroCsc] = useState<string | null>(null)
  const [classificando, setClassificando] = useState(false)
  const [remoto, setRemoto] = useState<{
    certificado: { existe: boolean; validade: string } | null
    creditos: number | null
  } | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [verificadoEm, setVerificadoEm] = useState('')
  const inputCertRef = useRef<HTMLInputElement>(null)

  const tocar = (campo: string) => setTocados((t) => ({ ...t, [campo]: true }))

  const carregar = useCallback(async () => {
    const [rc, rd, dadosLoja] = await Promise.all([
      window.api.fiscal.obter(),
      window.api.fiscal.diagnostico(),
      obterDadosLoja()
    ])
    if (rc.success) setConfig(rc.data)
    if (rd.success) setDiagnostico(rd.data)
    setLoja(dadosLoja)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // A UF da loja decide o formato da inscrição estadual — não existe formato
  // único no Brasil, cada estado tem o seu.
  const uf = (loja?.uf ?? '').toUpperCase()
  // Endereço obrigatório pra nota: sem logradouro/número/bairro a ACBr recusa o
  // cadastro do emitente. Número aceita "S/N" pra imóvel sem numeração.
  const obrig = (v: string, campo: string) =>
    (v ?? '').trim() ? null : `Informe ${campo}.`
  const erros = {
    ie: config ? validarInscricaoEstadual(config.inscricao_estadual, uf).erro : null,
    email: config ? validarEmail(config.email).erro : null,
    regime: config ? validarRegime(config.regime_tributario).erro : null,
    serie: config ? validarSerie(config.serie_nfce).erro : null,
    logradouro: config ? obrig(config.endereco_logradouro, 'o logradouro') : null,
    numero: config ? obrig(config.endereco_numero, 'o número (ou S/N)') : null,
    bairro: config ? obrig(config.endereco_bairro, 'o bairro') : null
  }
  const podeSalvar = Boolean(config) && !Object.values(erros).some(Boolean)

  // Endereço veio da migration (há partes preenchidas) mas o lojista ainda não
  // salvou — sinaliza que é sugestão a conferir.
  const enderecoPrePreenchido =
    Boolean(config) &&
    !config!.configurada &&
    Boolean(config!.endereco_logradouro || config!.endereco_bairro)

  const salvar = async () => {
    if (!config || !podeSalvar) return
    setSalvando(true)
    const r = await window.api.fiscal.salvar(config)
    setSalvando(false)
    setFeedback(
      r.success
        ? { tipo: 'ok', msg: 'Dados fiscais salvos.' }
        : { tipo: 'erro', msg: r.error }
    )
    if (r.success) carregar()
  }

  const alterar = <K extends keyof ConfigFiscal>(campo: K, valor: ConfigFiscal[K]) =>
    setConfig((c) => (c ? { ...c, [campo]: valor } : c))

  // Lê o .pfx escolhido e devolve o conteúdo em base64 (sem o prefixo data:).
  // O certificado nunca é gravado no disco daqui — vai direto pro backend.
  const escolherCertificado = (arquivo: File | undefined) => {
    setErroCert(null)
    if (!arquivo) return
    const nome = arquivo.name.toLowerCase()
    if (!nome.endsWith('.pfx') && !nome.endsWith('.p12')) {
      setErroCert('O certificado A1 é um arquivo .pfx (ou .p12).')
      return
    }
    const leitor = new FileReader()
    leitor.onerror = () => setErroCert('Não foi possível ler o arquivo.')
    leitor.onload = () => {
      const txt = String(leitor.result)
      const base64 = txt.slice(txt.indexOf(',') + 1) // tira "data:...;base64,"
      setArquivoCert({ nome: arquivo.name, base64 })
    }
    leitor.readAsDataURL(arquivo)
  }

  const enviarCertificado = async () => {
    if (!arquivoCert || !senhaCert) return
    setEnviando('certificado')
    setErroCert(null)
    // A empresa precisa existir na ACBr antes do certificado. Garante isso de
    // forma transparente pro lojista, em vez de exigir um passo separado.
    if (!config?.empresa_cadastrada) {
      const rc = await window.api.fiscal.cadastrarEmpresa()
      if (!rc.success) {
        setEnviando(null)
        setErroCert(rc.error)
        return
      }
    }
    const r = await window.api.fiscal.enviarCertificado({
      certificadoBase64: arquivoCert.base64,
      senha: senhaCert
    })
    setEnviando(null)
    if (!r.success) {
      setErroCert(r.error)
      return
    }
    // Some com a senha da memória assim que dá certo.
    setSenhaCert('')
    setArquivoCert(null)
    setFeedback({ tipo: 'ok', msg: 'Certificado enviado.' })
    carregar()
  }

  const salvarCsc = async () => {
    if (!csc.trim() || !idCsc.trim()) return
    setEnviando('csc')
    setErroCsc(null)
    if (!config?.empresa_cadastrada) {
      const rc = await window.api.fiscal.cadastrarEmpresa()
      if (!rc.success) {
        setEnviando(null)
        setErroCsc(rc.error)
        return
      }
    }
    const r = await window.api.fiscal.configurarCsc({ csc: csc.trim(), idCsc: idCsc.trim() })
    setEnviando(null)
    if (!r.success) {
      setErroCsc(r.error)
      return
    }
    setCsc('') // o CSC não fica guardado do lado do app
    setFeedback({ tipo: 'ok', msg: 'Código de segurança configurado.' })
    carregar()
  }

  // Pergunta à ACBr o estado real (certificado e créditos). Nada aqui custa
  // crédito, então dá pra conferir à vontade.
  const verificar = async () => {
    setVerificando(true)
    const r = await window.api.fiscal.statusRemoto()
    setVerificando(false)
    if (r.success) {
      setRemoto(r.data)
      setVerificadoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      carregar()
    } else {
      setFeedback({ tipo: 'erro', msg: r.error })
    }
  }

  // Bloco de envio do certificado (dropzone + senha + botão), reusado no estado
  // inicial e no "trocar certificado".
  const renderEnvioCertificado = () => (
    <div className="space-y-3">
      <input
        ref={inputCertRef}
        type="file"
        accept=".pfx,.p12"
        className="hidden"
        onChange={(e) => escolherCertificado(e.target.files?.[0])}
      />
      <div
        onClick={() => inputCertRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          escolherCertificado(e.dataTransfer.files?.[0])
        }}
        className="flex items-center gap-3 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          {arquivoCert ? (
            <p className="text-sm truncate">{arquivoCert.nome}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Clique ou arraste o arquivo <strong>.pfx</strong> aqui
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senhaCert">Senha do certificado</Label>
        <Input
          id="senhaCert"
          type="password"
          value={senhaCert}
          onChange={(e) => setSenhaCert(e.target.value)}
          placeholder="A senha que você definiu ao comprar o certificado"
        />
      </div>

      <ErroAcao texto={erroCert} />

      <div className="flex justify-end">
        <Button
          onClick={enviarCertificado}
          disabled={enviando !== null || !arquivoCert || !senhaCert}
        >
          {enviando === 'certificado' ? 'Enviando…' : 'Enviar certificado'}
        </Button>
      </div>
    </div>
  )

  if (!config) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>
  }

  // A identidade da loja já foi coletada pro cupom; a parte fiscal só completa
  // o que falta. Sem CNPJ não há emitente possível.
  const identidadeOk = Boolean(loja?.cnpj && loja?.razao_social)
  const dadosOk = identidadeOk && config.configurada && podeSalvar

  // Passos 2 e 3 só liberam depois do passo 1 salvo — antes disso, cadastrar a
  // empresa na ACBr falharia por falta de dado.
  const passo1Feito = identidadeOk && config.configurada
  const certificadoOk = Boolean(config.certificado_validade)
  const cscOk = config.csc_configurado

  // "Pronto" = todos os passos que dependem do lojista concluídos.
  const semNcmTotal = diagnostico?.produtos_sem_ncm ?? 0
  const tudoPronto =
    Boolean(config.empresa_cadastrada) &&
    Boolean(config.certificado_validade) &&
    config.csc_configurado &&
    (diagnostico?.total_produtos ?? 0) > 0 &&
    semNcmTotal === 0

  const semNcm = diagnostico?.produtos_sem_ncm ?? 0
  const totalProdutos = diagnostico?.total_produtos ?? 0
  const classificados = totalProdutos - semNcm

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold mb-1">Nota fiscal</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Habilitação da NFC-e — a nota do consumidor, que substitui o cupom fiscal. Ela sai na
        mesma impressora térmica que já imprime seus cupons hoje.
      </p>

      <div className="rounded-lg border bg-blue-50/50 border-blue-200 p-4 mb-6 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Nada aqui emite nota ainda.</p>
          <p className="text-muted-foreground mt-1">
            Esta tela reúne o que a sua loja precisa ter em mãos. Vá preenchendo com calma e,
            de preferência, junto com o seu contador — é ele quem responde pelas escolhas
            fiscais.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-md border p-3 mb-6 text-sm ${
            feedback.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* ── 1. Dados da empresa ── */}
        <Passo
          numero={1}
          titulo="Dados da empresa"
          descricao="O que a SEFAZ precisa saber sobre quem está emitindo."
          estado={dadosOk ? 'ok' : 'pendente'}
          icone={Building2}
        >
          {!identidadeOk && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Preencha antes o <strong>CNPJ e a razão social</strong> em Configurações →
                Dados da loja. A nota é emitida em nome dessa empresa.
              </p>
            </div>
          )}

          {identidadeOk && (
            <p className="text-xs text-muted-foreground">
              Emitente: <strong className="text-foreground">{loja?.razao_social}</strong> —
              CNPJ {loja?.cnpj}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ie">
                Inscrição Estadual
                {uf && <span className="text-muted-foreground font-normal"> ({uf})</span>}
              </Label>
              <Input
                id="ie"
                inputMode="numeric"
                value={config.inscricao_estadual}
                maxLength={maxDigitosIE(uf)}
                onBlur={() => tocar('ie')}
                // Só dígito entra. Letra, ponto e traço são descartados na
                // digitação — em vez de aceitar e reclamar depois.
                onChange={(e) =>
                  alterar(
                    'inscricao_estadual',
                    apenasDigitos(e.target.value).slice(0, maxDigitosIE(uf))
                  )
                }
                placeholder="Somente números"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Está no cartão de inscrição da empresa. Seu contador tem.
                </p>
                {formatoEsperadoIE(uf) && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {config.inscricao_estadual.length}/{maxDigitosIE(uf)}
                  </span>
                )}
              </div>
              {formatoEsperadoIE(uf) && (
                <p className="text-xs text-muted-foreground">
                  No {uf} são {formatoEsperadoIE(uf)}.
                </p>
              )}
              {!uf && (
                <p className="text-xs text-amber-700">
                  Informe o estado da loja em Dados da loja — o formato da inscrição muda de
                  estado para estado.
                </p>
              )}
              <Erro mostrar={Boolean(tocados.ie)} texto={erros.ie} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail da empresa</Label>
              <Input
                id="email"
                type="email"
                value={config.email}
                onBlur={() => tocar('email')}
                onChange={(e) => alterar('email', e.target.value)}
                placeholder="contato@sualoja.com.br"
              />
              <p className="text-xs text-muted-foreground">Usado nas comunicações fiscais.</p>
              <Erro mostrar={Boolean(tocados.email)} texto={erros.email} />
            </div>
          </div>

          {/* ── Endereço da nota ──
              A SEFAZ exige o endereço em campos separados. Cidade, UF e CEP já
              vêm de Dados da loja; aqui só o que falta. O cupom continua usando
              o endereço em texto livre — estes campos são exclusivos da nota. */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/10">
            <div>
              <p className="text-sm font-medium">Endereço da nota</p>
              <p className="text-xs text-muted-foreground">
                A nota fiscal exige o endereço em campos separados.{' '}
                {loja?.cep ? (
                  <>
                    Cidade, estado e CEP ({loja.cep}) vêm de Dados da loja.
                  </>
                ) : (
                  <>Cidade, estado e CEP vêm de Dados da loja.</>
                )}
              </p>
            </div>

            {enderecoPrePreenchido && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  Preenchemos a partir do endereço da loja. <strong>Confira</strong> antes de
                  emitir — separar endereço escrito à mão nem sempre acerta.
                </p>
              </div>
            )}

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="logradouro">Logradouro (rua, avenida…)</Label>
                <Input
                  id="logradouro"
                  value={config.endereco_logradouro}
                  onBlur={() => tocar('logradouro')}
                  onChange={(e) => alterar('endereco_logradouro', e.target.value)}
                  placeholder="Rua das Flores"
                />
                <Erro mostrar={Boolean(tocados.logradouro)} texto={erros.logradouro} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  className="w-28"
                  value={config.endereco_numero}
                  onBlur={() => tocar('numero')}
                  onChange={(e) => alterar('endereco_numero', e.target.value)}
                  placeholder="123 ou S/N"
                />
                <Erro mostrar={Boolean(tocados.numero)} texto={erros.numero} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={config.endereco_bairro}
                  onBlur={() => tocar('bairro')}
                  onChange={(e) => alterar('endereco_bairro', e.target.value)}
                  placeholder="Centro"
                />
                <Erro mostrar={Boolean(tocados.bairro)} texto={erros.bairro} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="complemento">
                  Complemento <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="complemento"
                  value={config.endereco_complemento}
                  onChange={(e) => alterar('endereco_complemento', e.target.value)}
                  placeholder="Sala 2, Loja B…"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regime">Regime tributário</Label>
            <select
              id="regime"
              className={CLASSE_SELECT}
              value={config.regime_tributario}
              onBlur={() => tocar('regime')}
              onChange={(e) => {
                tocar('regime')
                alterar('regime_tributario', e.target.value as ConfigFiscal['regime_tributario'])
              }}
            >
              <option value="">Selecione…</option>
              {REGIMES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Muda a forma como o imposto é calculado na nota.{' '}
              <strong>Confirme com o seu contador</strong> — errar aqui erra todas as notas.
            </p>
            <Erro mostrar={Boolean(tocados.regime)} texto={erros.regime} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie">Série da nota</Label>
            <Input
              id="serie"
              inputMode="numeric"
              className="max-w-32"
              maxLength={3}
              value={String(config.serie_nfce)}
              onBlur={() => tocar('serie')}
              // Texto em vez de type="number": o campo numérico do HTML aceita
              // "e", "+" e "-" e permite colar qualquer coisa. Aqui só dígito
              // entra, e a faixa válida é conferida logo abaixo.
              onChange={(e) =>
                alterar('serie_nfce', Number(apenasDigitos(e.target.value).slice(0, 3) || 0))
              }
            />
            <p className="text-xs text-muted-foreground">
              Deixe 1, a não ser que o contador peça outra.
            </p>
            <Erro mostrar={Boolean(tocados.serie)} texto={erros.serie} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfop">
                CFOP padrão <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="cfop"
                inputMode="numeric"
                maxLength={4}
                className="max-w-32"
                value={config.cfop_padrao}
                onChange={(e) => alterar('cfop_padrao', apenasDigitos(e.target.value).slice(0, 4))}
                placeholder="5102"
              />
              <p className="text-xs text-muted-foreground">
                Usado nos produtos sem CFOP próprio. Em branco, o sistema usa 5102 (venda dentro
                do estado). <strong>Confirme com o contador.</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bobina">Largura da bobina</Label>
              <select
                id="bobina"
                className={CLASSE_SELECT}
                value={String(config.largura_bobina)}
                onChange={(e) => alterar('largura_bobina', Number(e.target.value))}
              >
                <option value="80">80mm (padrão)</option>
                <option value="58">58mm (estreita)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                O tamanho do papel da sua impressora térmica.
              </p>
            </div>
          </div>

          {/* Ambiente — o interruptor que separa teste de nota de verdade. */}
          <div className="space-y-1.5 rounded-md border p-3 bg-muted/10">
            <Label htmlFor="ambiente">Ambiente de emissão</Label>
            <select
              id="ambiente"
              className={CLASSE_SELECT}
              value={config.ambiente}
              onChange={(e) =>
                alterar('ambiente', e.target.value as ConfigFiscal['ambiente'])
              }
            >
              <option value="homologacao">Teste (as notas não valem fiscalmente)</option>
              <option value="producao">Produção (notas válidas de verdade)</option>
            </select>
            {config.ambiente === 'homologacao' ? (
              <p className="text-xs text-amber-700">
                Em teste, as notas emitidas <strong>não têm valor fiscal</strong> — servem só pra
                conferir se está tudo certo. Passe para produção quando validar com o contador.
              </p>
            ) : (
              <p className="text-xs text-emerald-700">
                As notas emitidas <strong>valem de verdade</strong> e vão para a Receita.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {!podeSalvar && (
              <p className="text-xs text-muted-foreground">Preencha os campos acima pra salvar.</p>
            )}
            <Button onClick={salvar} disabled={salvando || !podeSalvar}>
              <Save className="w-4 h-4 mr-1.5" />
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </Passo>

        {/* ── 2. Certificado digital ── */}
        <Passo
          numero={2}
          titulo="Certificado digital A1"
          descricao="A assinatura eletrônica da empresa — sem ele a SEFAZ não aceita a nota."
          estado={certificadoOk ? 'ok' : passo1Feito ? 'pendente' : 'bloqueado'}
          icone={FileText}
        >
          {!passo1Feito ? (
            <CompleteOPasso1 />
          ) : certificadoOk ? (
            // Já enviado: mostra o titular e a validade (a data que alimenta o
            // aviso de vencimento no sino).
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Certificado enviado.</p>
                  {config.certificado_titular && (
                    <p className="text-xs mt-0.5">{config.certificado_titular}</p>
                  )}
                  <p className="text-xs mt-0.5">
                    Válido até <strong>{formatarData(config.certificado_validade)}</strong>. O
                    sistema avisa quando estiver perto de vencer.
                  </p>
                </div>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Trocar certificado</summary>
                <div className="mt-3">{renderEnvioCertificado()}</div>
              </details>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Envie o arquivo <strong>.pfx</strong> do seu certificado e-CNPJ A1 e a senha
                dele. O arquivo vai criptografado para o servidor fiscal — não fica guardado
                neste computador.
              </p>
              {renderEnvioCertificado()}
            </div>
          )}
        </Passo>

        {/* ── 3. CSC ── */}
        <Passo
          numero={3}
          titulo="Código de Segurança do Contribuinte (CSC)"
          descricao="O código que autentica o QR Code impresso na nota do consumidor."
          estado={cscOk ? 'ok' : passo1Feito ? 'pendente' : 'bloqueado'}
          icone={KeyRound}
        >
          {!passo1Feito ? (
            <CompleteOPasso1 />
          ) : (
            <div className="space-y-3">
              {cscOk && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Código configurado{config.csc_id ? ` (identificador ${config.csc_id})` : ''}.
                    Pode reenviar se ele mudar.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                O CSC é gerado no portal da SEFAZ do seu estado — normalmente pelo contador. São
                dois valores: um identificador curto (ex.: 000001) e o código em si.
              </p>
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="idCsc">Identificador</Label>
                  <Input
                    id="idCsc"
                    inputMode="numeric"
                    value={idCsc}
                    onChange={(e) => setIdCsc(apenasDigitos(e.target.value))}
                    placeholder="000001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="csc">Código (CSC)</Label>
                  <Input
                    id="csc"
                    value={csc}
                    onChange={(e) => setCsc(e.target.value)}
                    placeholder="Cole aqui o código"
                  />
                </div>
              </div>
              <ErroAcao texto={erroCsc} />
              <div className="flex justify-end">
                <Button
                  onClick={salvarCsc}
                  disabled={enviando !== null || !csc.trim() || !idCsc.trim()}
                >
                  {enviando === 'csc' ? 'Enviando…' : cscOk ? 'Reenviar código' : 'Salvar código'}
                </Button>
              </div>
            </div>
          )}
        </Passo>

        {/* ── 4. Classificação dos produtos ── */}
        <Passo
          numero={4}
          titulo="Classificação fiscal dos produtos"
          descricao="Cada produto precisa do NCM, o código que diz à Receita o que ele é."
          estado={totalProdutos > 0 && semNcm === 0 ? 'ok' : 'pendente'}
          icone={Package}
        >
          {totalProdutos === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold">{classificados}</span>
                <span className="text-sm text-muted-foreground">
                  de {totalProdutos} produtos já classificados
                </span>
              </div>

              {semNcm > 0 ? (
                <>
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>
                        <strong>{semNcm}</strong>{' '}
                        {semNcm === 1 ? 'produto ainda está' : 'produtos ainda estão'} sem NCM e
                        não {semNcm === 1 ? 'poderá' : 'poderão'} sair em nota.
                      </p>
                      <p>
                        Os produtos que entraram por XML de fornecedor já vieram classificados
                        automaticamente. Os que faltam foram cadastrados à mão —{' '}
                        <strong>peça a lista ao seu contador</strong>. O sistema não preenche
                        sozinho de propósito: NCM chutado passa pela SEFAZ e vira problema seu
                        numa fiscalização.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => setClassificando(true)}>
                      <Package className="w-4 h-4 mr-1.5" />
                      Classificar produtos
                    </Button>
                  </div>

                  {diagnostico && diagnostico.exemplos_sem_ncm.length > 0 && (
                    <div className="text-xs">
                      <p className="text-muted-foreground mb-1.5">Por exemplo:</p>
                      <ul className="space-y-1">
                        {diagnostico.exemplos_sem_ncm.map((p) => (
                          <li key={p.id} className="flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                            <span className="truncate">{p.nome}</span>
                          </li>
                        ))}
                      </ul>
                      {semNcm > diagnostico.exemplos_sem_ncm.length && (
                        <p className="text-muted-foreground mt-1.5">
                          …e mais {semNcm - diagnostico.exemplos_sem_ncm.length}.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-emerald-700">
                    Todos os produtos têm NCM. Vale conferir com o contador mesmo assim — o
                    sistema aproveitou a classificação que os fornecedores usaram.
                  </p>
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={() => setClassificando(true)}>
                      <Package className="w-4 h-4 mr-1.5" />
                      Revisar classificação
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Passo>

        {/* ── 5. Conferência final ──
            Pergunta à ACBr como as coisas estão de verdade, em vez de confiar
            só no que está gravado aqui. Tudo o que consulta é de graça. */}
        <Passo
          numero={5}
          titulo="Está tudo pronto?"
          descricao="Confere com o provedor fiscal antes da primeira nota de verdade."
          estado={tudoPronto ? 'ok' : passo1Feito ? 'pendente' : 'bloqueado'}
          icone={ShieldCheck}
        >
          {!passo1Feito ? (
            <CompleteOPasso1 />
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <ItemCheck ok={config.empresa_cadastrada} texto="Empresa registrada no provedor" />
                <ItemCheck
                  ok={certificadoOk}
                  texto={
                    certificadoOk
                      ? `Certificado válido até ${formatarData(config.certificado_validade)}`
                      : 'Certificado digital enviado'
                  }
                />
                <ItemCheck ok={cscOk} texto="Código de segurança (CSC) configurado" />
                <ItemCheck
                  ok={totalProdutos > 0 && semNcm === 0}
                  texto={
                    semNcm > 0
                      ? `${semNcm} ${semNcm === 1 ? 'produto sem' : 'produtos sem'} classificação fiscal`
                      : 'Produtos classificados'
                  }
                />
                {remoto?.creditos !== null && remoto !== null && (
                  <ItemCheck
                    ok={(remoto.creditos ?? 0) > 0}
                    texto={
                      (remoto.creditos ?? 0) > 0
                        ? `${remoto.creditos} créditos disponíveis`
                        : 'Sem créditos — fale com o suporte antes de emitir em produção'
                    }
                  />
                )}
              </div>

              {config.ambiente === 'homologacao' && tudoPronto && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Está tudo certo, mas a loja ainda está em <strong>modo teste</strong>. Emita
                    algumas notas para conferir e depois mude para produção no passo 1.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                {verificadoEm && (
                  <p className="text-xs text-muted-foreground">Conferido às {verificadoEm}</p>
                )}
                <Button variant="outline" onClick={verificar} disabled={verificando}>
                  {verificando ? 'Conferindo…' : 'Conferir agora'}
                </Button>
              </div>
            </div>
          )}
        </Passo>

        <Suspense fallback={null}>
          <ClassificacaoFiscal
            aberta={classificando}
            onFechar={() => setClassificando(false)}
            onMudou={carregar}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default ConfiguracaoFiscal
