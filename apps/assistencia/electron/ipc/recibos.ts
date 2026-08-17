import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import {
  criarRecibo,
  listarRecibos,
  mesesComRecibos,
  obterRecibo,
  proximoNumeroRecibo,
  cancelarRecibo,
  type DadosRecibo
} from '../db/queries/recibos'
import { requerDono, requerSessao } from '../sessao'

export function registrarHandlersRecibos(): void {
  registrarCanal('recibos:listar', (mes?: string) => {
    try {
      requerSessao()
      return { success: true, data: listarRecibos(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('recibos:meses', () => {
    try {
      requerSessao()
      return { success: true, data: mesesComRecibos() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('recibos:proximoNumero', () => {
    try {
      requerSessao()
      return { success: true, data: proximoNumeroRecibo() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('recibos:obter', (numero: number) => {
    try {
      requerSessao()
      return { success: true, data: obterRecibo(numero) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Emitir é do balcão (requerSessao): quem atende recebe o dinheiro e entrega
  // o papel na hora. Cancelar é do dono, como toda desfeita de documento.
  registrarCanal('recibos:criar', (dados: DadosRecibo) => {
    try {
      requerSessao()
      const recibo = criarRecibo(dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: recibo }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('recibos:cancelar', (args: { numero: number; motivo: string }) => {
    try {
      requerDono()
      cancelarRecibo(args.numero, args.motivo)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: obterRecibo(args.numero) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
