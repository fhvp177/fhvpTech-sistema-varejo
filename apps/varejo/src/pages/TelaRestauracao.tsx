import { FC, useEffect, useState } from 'react'
import { Lock, ShieldAlert, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ModalSenhaRestauracao from '@/components/backup/ModalSenhaRestauracao'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type BackupDisponivel = {
  nome: string
  caminho: string
  subpasta: string
  dataModificacao: number
  tamanhoBytes: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LABEL_SUBPASTA: Record<string, string> = {
  manuais: 'Manuais',
  diarios: 'Diários',
  semanais: 'Semanais',
  mensais: 'Mensais',
  automaticos: 'Automáticos',
  'por-venda': 'Por venda',
  'pre-restauracao': 'Pré-restauração',
  'pre-update': 'Pré-atualização',
}

const fmtData = (ms: number) =>
  new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const fmtTamanho = (bytes: number) => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_024).toFixed(0)} KB`
}

// ─── Componente principal ─────────────────────────────────────────────────────

const TelaRestauracao: FC = () => {
  const [senhaConfigurada, setSenhaConfigurada] = useState<boolean | null>(null)
  const [autenticado, setAutenticado] = useState(false)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false)
  const [backups, setBackups] = useState<BackupDisponivel[]>([])
  const [backupSelecionado, setBackupSelecionado] = useState<BackupDisponivel | null>(null)
  const [restaurando, setRestaurando] = useState(false)
  const [resultado, setResultado] = useState<{ sucesso: boolean; msg: string } | null>(null)

  useEffect(() => {
    window.api.backup.obterStatus().then((resp) => {
      if (resp.success) {
        const s = resp.data as { senhaConfigurada: boolean }
        setSenhaConfigurada(s.senhaConfigurada)
      }
    })
  }, [])

  const carregarBackups = async () => {
    const resp = await window.api.backup.listarBackups()
    if (resp.success) setBackups(resp.data as BackupDisponivel[])
  }

  const handleSenhaCorreta = async () => {
    setModalSenhaAberto(false)
    setAutenticado(true)
    await carregarBackups()
  }

  const executarRestauracao = async () => {
    if (!backupSelecionado) return
    const alvo = backupSelecionado
    setBackupSelecionado(null)
    setRestaurando(true)
    setResultado(null)

    const resp = await window.api.backup.restaurar(alvo.caminho)
    setRestaurando(false)

    if (resp.success) {
      setResultado({
        sucesso: true,
        msg: 'Restauração concluída com sucesso! Reinicie o sistema para que todas as alterações sejam aplicadas corretamente.',
      })
    } else {
      setResultado({
        sucesso: false,
        msg: (resp as { success: false; error: string }).error,
      })
    }
  }

  // ── Carregando ──
  if (senhaConfigurada === null) {
    return (
      <div className="p-8 flex items-center justify-center h-full text-muted-foreground text-sm">
        Carregando...
      </div>
    )
  }

  // ── Senha não configurada ──
  if (!senhaConfigurada) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Funcionalidade não configurada</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          A restauração de backup precisa ser ativada pelo suporte técnico antes de ser utilizada.
          Entre em contato para configurar a senha de acesso.
        </p>
      </div>
    )
  }

  // ── Restauração concluída ──
  if (resultado?.sucesso) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <RotateCcw className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-green-700">Restauração concluída!</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{resultado.msg}</p>
        <Button onClick={() => window.location.reload()}>Reiniciar sistema</Button>
      </div>
    )
  }

  // ── Bloqueado ──
  if (!autenticado) {
    return (
      <>
        <div className="p-8 flex flex-col items-center justify-center h-full gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Restauração de Backup</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Esta área é protegida. Informe a senha de acesso para continuar.
          </p>
          <Button onClick={() => setModalSenhaAberto(true)}>Desbloquear</Button>
        </div>
        <ModalSenhaRestauracao
          open={modalSenhaAberto}
          onSucesso={handleSenhaCorreta}
          onCancelar={() => setModalSenhaAberto(false)}
        />
      </>
    )
  }

  // ── Tela principal (autenticado) ──
  const subpastasComBackups = Array.from(new Set(backups.map((b) => b.subpasta)))

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Restauração de Backup</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Selecione um backup para restaurar. Um backup de segurança será criado automaticamente antes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregarBackups}>
          Atualizar lista
        </Button>
      </div>

      {/* Aviso de operação destrutiva */}
      <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          A restauração <strong>substitui todos os dados atuais</strong> pelos dados do backup selecionado.
          Esta operação não pode ser desfeita (exceto usando outro backup).
        </p>
      </div>

      {backups.length === 0 ? (
        <div className="border rounded-lg py-16 text-center text-muted-foreground text-sm">
          Nenhum backup encontrado na pasta configurada.
        </div>
      ) : (
        <div className="space-y-5">
          {subpastasComBackups.map((subpasta) => (
            <div key={subpasta}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {LABEL_SUBPASTA[subpasta] ?? subpasta}
              </h3>
              <div className="border rounded-lg overflow-hidden">
                {backups
                  .filter((b) => b.subpasta === subpasta)
                  .map((backup, i, arr) => (
                    <div
                      key={backup.caminho}
                      className={`flex items-center justify-between px-4 py-3 text-sm ${
                        i < arr.length - 1 ? 'border-b' : ''
                      }`}
                    >
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{backup.nome}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtData(backup.dataModificacao)} · {fmtTamanho(backup.tamanhoBytes)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBackupSelecionado(backup)}
                        disabled={restaurando}
                      >
                        Restaurar
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {resultado && !resultado.sucesso && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
          <strong>Falha na restauração:</strong> {resultado.msg}
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={!!backupSelecionado} onOpenChange={(open) => !open && setBackupSelecionado(null)}>
        {backupSelecionado && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar restauração</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Você está prestes a restaurar o backup:
              </p>
              <div className="bg-muted rounded-lg px-3 py-2 font-mono text-xs break-all">
                {backupSelecionado.nome}
              </div>
              <p className="text-muted-foreground">
                <strong className="text-foreground">Todos os dados atuais serão substituídos.</strong>{' '}
                Um backup automático de segurança será criado antes da restauração.
              </p>
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="outline" onClick={() => setBackupSelecionado(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={executarRestauracao}
                disabled={restaurando}
              >
                {restaurando ? 'Restaurando...' : 'Confirmar restauração'}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Overlay de progresso */}
      {restaurando && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center space-y-3">
            <RotateCcw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">Restaurando backup...</p>
            <p className="text-xs text-muted-foreground">Não feche o sistema.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default TelaRestauracao
