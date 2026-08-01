/**
 * Casca do Electron em volta da configuração do multi-caixa.
 *
 * A lógica toda (validação, degradação segura, gravação atômica) vive em
 * `configLogica.ts`, que não conhece Electron e por isso pode ser testada de
 * verdade. Aqui só se resolve ONDE o arquivo mora — mesma separação que
 * `pastaDados.ts` / `pastaDadosLogica.ts` já usam.
 */
import { app } from 'electron'
import { join } from 'path'
import {
  gravarConfigEm,
  lerConfigDe,
  type ConfigMulticaixa,
  type ModoMulticaixa
} from './configLogica'

export type { ConfigMulticaixa, ModoMulticaixa, TerminalPareado } from './configLogica'
export { CONFIG_PADRAO, PORTA_PADRAO } from './configLogica'

/**
 * Fica ao lado da licença e do heartbeat, na pasta de dados do usuário — e não
 * junto do banco, porque o terminal não tem banco.
 */
export function caminhoConfigMulticaixa(): string {
  return join(app.getPath('userData'), 'multicaixa.json')
}

export function lerConfigMulticaixa(): ConfigMulticaixa {
  return lerConfigDe(caminhoConfigMulticaixa())
}

export function gravarConfigMulticaixa(config: ConfigMulticaixa): void {
  gravarConfigEm(caminhoConfigMulticaixa(), config)
}

/**
 * Atalho para o boot: qual modo esta máquina opera. Lido antes de abrir banco,
 * criar janela ou registrar canal — é ele que decide se o app sequer abre o
 * banco de dados.
 */
export function modoMulticaixa(): ModoMulticaixa {
  return lerConfigMulticaixa().modo
}
