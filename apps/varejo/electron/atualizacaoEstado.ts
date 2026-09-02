/**
 * O que se sabe sobre a atualização — só o valor, sem o mecanismo.
 *
 * ── Por que existe separado do atualizador ───────────────────────────────────
 * Quem PREENCHE isto é o `atualizador.ts`, que depende do Electron e do
 * electron-updater. Quem LÊ, além da tela de Configurações, é o sino de
 * notificações: ele avisa "atualização pronta pra instalar".
 *
 * Enquanto o estado morava dentro do atualizador, essa leitura arrastava o
 * mecanismo inteiro junto — e com ele o Electron. No servidor web isso barrava
 * o sino de notificações completo por causa de um único alerta.
 *
 * Separado, cada lado carrega o que precisa: o servidor lê um estado que
 * ninguém preenche (não há atualização automática no navegador — recarregar a
 * página basta) e simplesmente não mostra aquele alerta. Sem condicional, sem
 * flag: o alerta não aparece porque não há o que anunciar.
 */
import { versaoApp } from '@fhvptech/core/electron/plataforma'

export type EstadoAtualizacao = {
  versaoAtual: string
  ultimaVerificacao: string | null
  ultimaMensagem: string | null
  versaoBaixada: string | null
}

/**
 * O estado que o atualizador escreve. Exportado como objeto mutável porque é
 * assim que ele já o usava — separar o arquivo não deveria obrigar a reescrever
 * as nove atribuições de lá.
 */
export const estadoAtualizacao: Omit<EstadoAtualizacao, 'versaoAtual'> = {
  ultimaVerificacao: null,
  ultimaMensagem: null,
  versaoBaixada: null
}

/**
 * Cópia do estado, para ninguém mexer no de dentro.
 *
 * `versaoAtual` é calculada na leitura, e não guardada na criação do módulo:
 * perguntar a versão exige a plataforma já ligada, e um módulo pode ser
 * carregado antes disso.
 */
export function obterEstadoAtualizacao(): EstadoAtualizacao {
  return { ...estadoAtualizacao, versaoAtual: versaoApp() }
}
