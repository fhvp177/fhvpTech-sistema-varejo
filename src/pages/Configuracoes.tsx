import { FC, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RefreshCw } from 'lucide-react'
import CadastroVendedores from '@/components/CadastroVendedores'
import ConfigSeguranca from '@/components/ConfigSeguranca'

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
  const [infoAtualizacao, setInfoAtualizacao] = useState<InfoAtualizacao | null>(null)
  const [verificandoUpdate, setVerificandoUpdate] = useState(false)
  const [status, setStatus] = useState<StatusBackup | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [frequencia, setFrequencia] = useState('2')
  const [aoFechar, setAoFechar] = useState('perguntar')
  const [porVenda, setPorVenda] = useState(false)
  const [pastaPadrao, setPastaPadrao] = useState('')
  const [pastaSecundaria, setPastaSecundaria] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [fazendoBackup, setFazendoBackup] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

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

  const salvar = async () => {
    setSalvando(true)
    try {
      await window.api.backup.gravarConfig('backup_ativo', ativo ? '1' : '0')
      await window.api.backup.gravarConfig('backup_frequencia_horas', frequencia)
      await window.api.backup.gravarConfig('backup_ao_fechar', aoFechar)
      await window.api.backup.gravarConfig('backup_por_venda', porVenda ? '1' : '0')
      mostrarFeedback('ok', 'Configurações salvas com sucesso!')
      await carregarStatus()
    } catch {
      mostrarFeedback('erro', 'Erro ao salvar configurações.')
    } finally {
      setSalvando(false)
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
    setFeedback(null)
    const resp = await window.api.backup.fazerManual()
    setFazendoBackup(false)
    if (resp.success) {
      mostrarFeedback('ok', 'Backup manual realizado com sucesso!')
      await carregarStatus()
    } else {
      mostrarFeedback('erro', `Falha no backup: ${(resp as { success: false; error: string }).error}`)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Configurações</h2>

      <div className="space-y-6 mb-10">
        <h3 className="text-lg font-semibold border-b pb-2">Sistema</h3>

        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">GN Modas — Sistema de Gestão</p>
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
      </div>

      <div className="space-y-4 mb-10">
        <h3 className="text-lg font-semibold border-b pb-2">Segurança</h3>
        <ConfigSeguranca />
      </div>

      <div className="space-y-4 mb-10">
        <h3 className="text-lg font-semibold border-b pb-2">Vendedores</h3>
        <p className="text-sm text-muted-foreground -mt-1">
          Cadastre os vendedores da loja. Cada venda registra o vendedor que a realizou,
          permitindo acompanhar produção individual no histórico.
        </p>
        <CadastroVendedores />
      </div>

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
            onClick={() => setAtivo(!ativo)}
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
          <select
            value={frequencia}
            onChange={(e) => setFrequencia(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="1">A cada 1 hora</option>
            <option value="2">A cada 2 horas</option>
            <option value="4">A cada 4 horas</option>
            <option value="8">A cada 8 horas</option>
            <option value="24">A cada 24 horas</option>
            <option value="desativado">Desativado</option>
          </select>
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
            onClick={() => setPorVenda(!porVenda)}
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
          <select
            value={aoFechar}
            onChange={(e) => setAoFechar(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="perguntar">Perguntar se houve alterações</option>
            <option value="sempre">Sempre fazer automaticamente</option>
            <option value="nunca">Nunca</option>
          </select>
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

        {/* Salvar */}
        <div className="flex items-center gap-3">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar configurações'}
          </Button>
          {feedback && (
            <p className={`text-sm font-medium ${feedback.tipo === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {feedback.msg}
            </p>
          )}
        </div>

        {/* Backup manual */}
        <div className="border-t pt-5">
          <h4 className="font-medium mb-1">Backup manual</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Cria um backup imediato salvo na pasta{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">manuais/</code>.
            Útil antes de operações importantes.
          </p>
          <Button variant="outline" onClick={fazerBackup} disabled={fazendoBackup}>
            {fazendoBackup ? 'Criando backup...' : 'Fazer backup agora'}
          </Button>
        </div>
      </div>
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
