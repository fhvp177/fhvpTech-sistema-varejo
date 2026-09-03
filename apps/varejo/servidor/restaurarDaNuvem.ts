/**
 * Trazer um backup de volta da nuvem.
 *
 * ── O buraco que isto fecha ──────────────────────────────────────────────────
 * O backup sobe para o R2, mas até aqui não descia. E é justamente o caso para
 * o qual o envio existe: se o disco da máquina se perder, os backups LOCAIS vão
 * junto — eles moram no mesmo volume. A cópia lá fora estava lá, e não havia
 * caminho de volta que não fosse eu, na mão, com dois comandos.
 *
 * Procedimento de emergência que só existe na cabeça de alguém não é
 * procedimento.
 *
 * ── O que estes canais fazem, e o que NÃO fazem ─────────────────────────────
 * Eles listam o que há na nuvem e trazem um arquivo para o disco da loja. Só.
 * A restauração em si continua sendo a de sempre — mesma tela, mesma senha de
 * restauração, mesma cópia de segurança tirada antes de sobrescrever.
 *
 * Foi decisão, e não preguiça: restaurar já é a operação mais destrutiva do
 * sistema, e já tem uma porta com tranca. Criar uma segunda porta que restaura
 * direto da nuvem seria duplicar o caminho perigoso para economizar um clique.
 *
 * ── Uma ordem que o desastre impõe ───────────────────────────────────────────
 * Máquina nova nasce com banco vazio E sem licença. Sem licença não há
 * `clienteId`, e sem ele não se sabe qual pasta do R2 é desta loja. Então a
 * recuperação é obrigatoriamente: ativar a licença, DEPOIS restaurar. Ao
 * contrário não há de onde buscar, e os canais abaixo dizem isso em vez de
 * devolver lista vazia — que pareceria "não há backup nenhum".
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'
import { pastaDados } from '@fhvptech/core/electron/plataforma'
import { requerDono } from '../electron/sessao'

import { baixarDoR2, credenciaisDoAmbiente, listarNoR2, type ObjetoNaNuvem } from './r2'

/** Onde o arquivo baixado é posto, para a tela de restauração enxergá-lo. */
const SUBPASTA_DESTINO = 'da-nuvem'

/** Maior arquivo que se aceita trazer. O banco de uma loja não chega perto. */
const LIMITE_BYTES = 200 * 1024 * 1024

interface Contexto {
  cred: NonNullable<ReturnType<typeof credenciaisDoAmbiente>>
  clienteId: string
}

/**
 * As duas coisas sem as quais não há o que buscar. Devolve a explicação em vez
 * de lista vazia: "não configurado" e "não há backup" pedem reações opostas de
 * quem está lendo, e confundir os dois num momento de emergência é caro.
 */
function contexto(): Contexto | string {
  const cred = credenciaisDoAmbiente()
  if (!cred) return 'O backup na nuvem não está configurado nesta loja.'

  const clienteId = extrairClienteIdLocal()
  if (!clienteId) {
    return 'Ative a licença desta loja primeiro — é ela que diz de quem são os backups guardados.'
  }
  return { cred, clienteId }
}

/** Só o nome do arquivo, sem caminho, e sem nada que escape da pasta. */
function nomeSeguro(chave: string): string {
  return basename(chave).replace(/[^A-Za-z0-9._-]/g, '_')
}

export function registrarHandlersNuvem(): void {
  registrarCanal('backup:listarNuvem', async () => {
    try {
      requerDono()
      const ctx = contexto()
      if (typeof ctx === 'string') return { success: false, error: ctx }

      const itens = await listarNoR2(ctx.cred, `lojas/${ctx.clienteId}/`)
      return {
        success: true,
        data: itens.map((o: ObjetoNaNuvem) => ({
          chave: o.chave,
          nome: basename(o.chave),
          // De qual subpasta veio — diário, manual, ou a cópia tirada antes de
          // uma migration. A última é a que interessa depois de um problema
          // numa atualização.
          tipo: o.chave.split('/').slice(-2)[0] ?? '',
          tamanhoBytes: o.tamanhoBytes,
          quando: o.quando
        }))
      }
    } catch (erro) {
      return { success: false, error: (erro as Error).message }
    }
  })

  registrarCanal('backup:baixarDaNuvem', async (chave: string) => {
    try {
      requerDono()
      const ctx = contexto()
      if (typeof ctx === 'string') return { success: false, error: ctx }

      // ⚠️ A pasta de uma loja é `lojas/<clienteId>/`. Sem esta conferência,
      // bastaria mandar a chave de OUTRA loja para trazer o banco dela para
      // dentro desta — e o `requerDono()` acima não ajudaria em nada, porque o
      // gerente desta loja é dono legítimo aqui e de mais nada.
      const meu = `lojas/${ctx.clienteId}/`
      if (typeof chave !== 'string' || !chave.startsWith(meu)) {
        return { success: false, error: 'Este backup não pertence a esta loja.' }
      }

      const conteudo = await baixarDoR2(ctx.cred, chave)
      if (conteudo.length > LIMITE_BYTES) {
        return { success: false, error: 'O arquivo é grande demais para ser trazido automaticamente.' }
      }

      const pasta = join(pastaDados(), 'Backups', SUBPASTA_DESTINO)
      mkdirSync(pasta, { recursive: true })
      const destino = join(pasta, nomeSeguro(chave))
      writeFileSync(destino, conteudo)

      // O arquivo agora está no disco, na pasta que a tela de restauração já
      // varre. Daqui em diante o caminho é o de sempre.
      return { success: true, data: { caminho: destino, tamanhoBytes: conteudo.length } }
    } catch (erro) {
      return { success: false, error: (erro as Error).message }
    }
  })
}
