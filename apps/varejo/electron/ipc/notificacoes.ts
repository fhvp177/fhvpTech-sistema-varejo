import { ipcMain } from 'electron'
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { validarLicenca } from '@fhvptech/core/electron/licenca'
import { obterEstadoAtualizacao } from '../atualizador'
import {
  alertasDoBanco,
  sincronizar,
  listar,
  contarNaoLidas,
  marcarTodasLidas,
  dispensar,
  type AlertaVivo
} from '../db/queries/notificacoes'
import {
  listarRecebiveis,
  listarProdutosAlerta,
  type RecebivelDetalhe,
  type ProdutoAlertaDetalhe
} from '../db/queries/alertasDetalhe'
import { alertasContasPagar } from '../db/queries/contasPagar'

// Detalhe que abre no popup ao clicar numa notificação (estado de AGORA).
export type DetalheNotificacao =
  | {
      kind: 'recebiveis'
      titulo: string
      criterio: string
      cobranca: 'vence' | 'atraso'
      itens: RecebivelDetalhe[]
    }
  | { kind: 'produtos'; titulo: string; criterio: string; itens: ProdutoAlertaDetalhe[] }

// Mapeia a `chave` do aviso pro detalhe correspondente. Chaves sem detalhe
// (sistema, meta, etc.) devolvem null → o app mantém o comportamento antigo.
function detalheDaNotificacao(chave: string): DetalheNotificacao | null {
  switch (chave) {
    case 'venc-hoje':
      return {
        kind: 'recebiveis', titulo: 'Vencem hoje',
        criterio: 'Recebimentos com vencimento hoje', cobranca: 'vence',
        itens: listarRecebiveis('hoje')
      }
    case 'vence-amanha':
      return {
        kind: 'recebiveis', titulo: 'Vencem amanhã',
        criterio: 'Recebimentos com vencimento amanhã', cobranca: 'vence',
        itens: listarRecebiveis('amanha')
      }
    case 'inadimplentes':
      return {
        kind: 'recebiveis', titulo: 'Clientes em atraso',
        criterio: 'Recebimentos vencidos e ainda em aberto', cobranca: 'atraso',
        itens: listarRecebiveis('atraso')
      }
    case 'estoque-baixo':
      return {
        kind: 'produtos', titulo: 'Estoque baixo',
        criterio: 'Itens com 5 unidades ou menos',
        itens: listarProdutosAlerta('estoque-baixo')
      }
    case 'produtos-parados':
      return {
        kind: 'produtos', titulo: 'Produtos parados',
        criterio: 'Com estoque, sem venda há 30+ dias',
        itens: listarProdutosAlerta('produtos-parados')
      }
    default:
      return null
  }
}

// Alertas que NÃO vêm do banco: backup (config), licença e atualização. Backup
// falhando / pasta cheia trazem o gancho do plano com backup em nuvem (suporte).
function alertasDoSistema(): AlertaVivo[] {
  const alertas: AlertaVivo[] = []

  const falhas = parseInt(lerConfig('backup_falhas_consecutivas') || '0', 10)
  if (falhas > 0) {
    alertas.push({
      chave: 'backup-falha',
      assinatura: `${falhas}`,
      tipo: 'sistema',
      severidade: 'critico',
      titulo: 'Backup automático falhando',
      descricao:
        `${falhas} falha(s) seguida(s). Fale com o suporte sobre o plano com backup em nuvem — ` +
        'seus dados ficam seguros mesmo se algo acontecer com este computador.',
      rota: '/configuracoes',
      acao: 'suporte'
    })
  }

  if (lerConfig('backup_alerta_tamanho') === '1') {
    alertas.push({
      chave: 'backup-pasta-cheia',
      assinatura: 'cheia',
      tipo: 'sistema',
      severidade: 'alerta',
      titulo: 'Pasta de backup cheia',
      descricao:
        'A pasta de backups passou de 500 MB. Libere espaço ou fale com o suporte sobre o backup em nuvem.',
      rota: '/configuracoes',
      acao: 'suporte'
    })
  }

  // Backup ligado, mas sem rodar há 3+ dias.
  if (lerConfig('backup_ativo') === '1') {
    const ultimo = lerConfig('backup_timestamp_ultimo_backup')
    const ms = ultimo ? Date.now() - new Date(ultimo).getTime() : Infinity
    const dias = Math.floor(ms / 86400000)
    if (dias >= 3) {
      alertas.push({
        chave: 'backup-atrasado',
        assinatura: ultimo ? `desde:${ultimo.slice(0, 10)}` : 'nunca',
        tipo: 'sistema',
        severidade: 'alerta',
        titulo: 'Backup desatualizado',
        descricao: ultimo
          ? `O último backup foi há ${dias} dia(s). Considere o plano com backup em nuvem (suporte).`
          : 'Ainda não há nenhum backup. Considere o plano com backup em nuvem (suporte).',
        rota: '/configuracoes',
        acao: 'suporte'
      })
    }
  }

  // Licença vencendo (≤ 7 dias).
  try {
    const lic = validarLicenca()
    if (lic.valida && typeof lic.diasRestantes === 'number' && lic.diasRestantes <= 7) {
      alertas.push({
        chave: 'licenca-vence',
        assinatura: `${lic.diasRestantes}`,
        tipo: 'sistema',
        severidade: lic.diasRestantes <= 3 ? 'critico' : 'alerta',
        titulo: `Licença vence em ${lic.diasRestantes} dia(s)`,
        descricao: 'Renove para não ter o sistema bloqueado.',
        rota: null,
        acao: 'pix'
      })
    }
  } catch {
    /* licença indisponível — ignora */
  }

  // Atualização baixada e pronta pra instalar.
  const upd = obterEstadoAtualizacao()
  if (upd.versaoBaixada) {
    alertas.push({
      chave: 'atualizacao',
      assinatura: `pronta:${upd.versaoBaixada}`,
      tipo: 'sistema',
      severidade: 'info',
      titulo: `Atualização ${upd.versaoBaixada} pronta`,
      descricao: 'Reinicie o sistema para instalar a nova versão.',
      rota: null,
      acao: 'instalar-update'
    })
  }

  return alertas
}

function computarESincronizar(): void {
  sincronizar([...alertasDoBanco(), ...alertasContasPagar(), ...alertasDoSistema()])
}

export function registrarHandlersNotificacoes(): void {
  ipcMain.handle('notificacoes:listar', () => {
    try {
      computarESincronizar()
      return { success: true, data: { itens: listar(), naoLidas: contarNaoLidas() } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('notificacoes:detalhe', (_event, chave: string) => {
    try {
      return { success: true, data: detalheDaNotificacao(String(chave)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('notificacoes:marcarLidas', () => {
    try {
      marcarTodasLidas()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('notificacoes:dispensar', (_event, id: number) => {
    try {
      dispensar(Number(id))
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
