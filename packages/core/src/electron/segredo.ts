// Amarração do cofre de segredos com o mundo real: safeStorage do Electron por
// cima da tabela `config`. Toda a decisão está em segredoLogica.ts — aqui só se
// liga um fio no outro, pra que a lógica seja testável sem abrir uma janela.
//
// safeStorage só funciona depois do `app.whenReady()`. Como todo acesso a
// segredo acontece via IPC (portanto muito depois do boot), não há corrida —
// mas nada aqui deve ser chamado no topo de um módulo.

import { safeStorage } from 'electron'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import {
  guardarSegredoCom,
  lerSegredoCom,
  temSegredoCom,
  type Cofre,
  type Deposito
} from '@fhvptech/core/electron/segredoLogica'

const cofre: Cofre = {
  disponivel: () => safeStorage.isEncryptionAvailable(),
  cifrar: (texto) => safeStorage.encryptString(texto),
  decifrar: (blob) => safeStorage.decryptString(blob)
}

const deposito: Deposito = {
  ler: (chave) => lerConfig(chave),
  gravar: (chave, valor) => gravarConfig(chave, valor)
}

/** Grava cifrado. Valor vazio apaga. Lança se o SO não oferecer o cofre. */
export function guardarSegredo(chave: string, valor: string): void {
  guardarSegredoCom(cofre, deposito, chave, valor)
}

/** Lê, ou `null` se não der pra abrir. Nunca lança — ver segredoLogica.ts. */
export function lerSegredo(chave: string): string | null {
  return lerSegredoCom(cofre, deposito, chave)
}

/**
 * Se há algo gravado, mesmo ilegível nesta máquina. Serve pra tela distinguir
 * "nunca configurou" de "configurou noutro PC e o backup trouxe o borrão" —
 * duas situações que pedem mensagens bem diferentes ao lojista.
 */
export function temSegredo(chave: string): boolean {
  return temSegredoCom(deposito, chave)
}

/** Se esta máquina consegue guardar segredo. Falso = tela deve avisar antes. */
export function cofreDisponivel(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}
