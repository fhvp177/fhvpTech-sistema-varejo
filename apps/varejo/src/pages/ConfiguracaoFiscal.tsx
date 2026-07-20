import { FC, useCallback, useEffect, useState } from 'react'
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

// Passo que ainda não dá pra executar. Não é enfeite: é a lista de compras da
// habilitação fiscal — o lojista lê e já sai atrás, em paralelo ao resto.
const PassoBloqueado: FC<{
  numero: number
  titulo: string
  descricao: string
  icone: FC<{ className?: string }>
  comoObter: string[]
}> = ({ numero, titulo, descricao, icone, comoObter }) => (
  <Passo numero={numero} titulo={titulo} descricao={descricao} estado="bloqueado" icone={icone}>
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="space-y-2">
        <p className="font-medium text-foreground">
          Ainda não disponível — o envio entra na próxima etapa do sistema.
        </p>
        <p>Aproveite pra ir providenciando, porque depende de terceiros e costuma demorar:</p>
        <ul className="list-disc pl-4 space-y-1">
          {comoObter.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  </Passo>
)

const ConfiguracaoFiscal: FC = () => {
  const [config, setConfig] = useState<ConfigFiscal | null>(null)
  const [diagnostico, setDiagnostico] = useState<DiagnosticoFiscal | null>(null)
  const [loja, setLoja] = useState<DadosLoja | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [tocados, setTocados] = useState<Record<string, boolean>>({})

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
  const erros = {
    ie: config ? validarInscricaoEstadual(config.inscricao_estadual, uf).erro : null,
    email: config ? validarEmail(config.email).erro : null,
    regime: config ? validarRegime(config.regime_tributario).erro : null,
    serie: config ? validarSerie(config.serie_nfce).erro : null
  }
  const podeSalvar = Boolean(config) && !Object.values(erros).some(Boolean)

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

  if (!config) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>
  }

  // A identidade da loja já foi coletada pro cupom; a parte fiscal só completa
  // o que falta. Sem CNPJ não há emitente possível.
  const identidadeOk = Boolean(loja?.cnpj && loja?.razao_social)
  const dadosOk = identidadeOk && config.configurada && podeSalvar

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
        <PassoBloqueado
          numero={2}
          titulo="Certificado digital A1"
          descricao="A assinatura eletrônica da empresa — sem ele a SEFAZ não aceita a nota."
          icone={FileText}
          comoObter={[
            'Compre um certificado e-CNPJ do tipo A1 (arquivo, não cartão nem token). Custa entre R$120 e R$250 por ano.',
            'A emissão exige uma videoconferência de validação — agende com antecedência.',
            'Guarde o arquivo .pfx e a senha; você vai enviar os dois por aqui.',
            'Vale por 1 ano. O sistema vai avisar quando estiver perto de vencer.'
          ]}
        />

        {/* ── 3. CSC ── */}
        <PassoBloqueado
          numero={3}
          titulo="Código de Segurança do Contribuinte (CSC)"
          descricao="O código que autentica o QR Code impresso na nota do consumidor."
          icone={KeyRound}
          comoObter={[
            'É gerado no portal da SEFAZ do seu estado, não tem custo.',
            'Normalmente quem faz é o contador, com o acesso da empresa.',
            'Vêm dois valores: o identificador (um número curto, tipo 000001) e o código em si.',
            'Exclusivo da NFC-e — a nota entre empresas não usa.'
          ]}
        />

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
                <p className="text-sm text-emerald-700">
                  Todos os produtos têm NCM. Vale conferir com o contador mesmo assim — o
                  sistema aproveitou a classificação que os fornecedores usaram.
                </p>
              )}
            </>
          )}
        </Passo>
      </div>
    </div>
  )
}

export default ConfiguracaoFiscal
