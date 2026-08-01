/**
 * Receber uma cópia do banco de outra máquina.
 *
 * ── Esta operação é destrutiva ───────────────────────────────────────────────
 * O banco desta máquina é substituído por inteiro. Se ela tinha vendas, elas
 * deixam de existir. Isso não é efeito colateral, é o objetivo — mas significa
 * que um clique errado apaga o trabalho de alguém.
 *
 * Por isso o passo mais importante daqui não é receber nem restaurar: é
 * **guardar o estado atual antes de sobrescrever**. Se a pessoa clonou a
 * máquina errada, ou clonou na direção contrária à que queria, existe um zip
 * com o que havia aqui, na pasta de backups, com data e hora.
 *
 * A senha de restauração continua sendo exigida pelo restaurador — é a segunda
 * tranca, e é do dono.
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync } from 'fs'
import { restaurarBackup } from '@fhvptech/core/electron/backup/Restaurador'
import { fazerBackupManual } from '@fhvptech/core/electron/backup/BackupManual'
import {
  temSenhaConfigurada,
  verificarSenha
} from '@fhvptech/core/electron/backup/SenhaRestauracao'
import {
  normalizarEndereco,
  RECUSA_CLONAGEM,
  type MotivoRecusaClonagem
} from '@fhvptech/core/electron/multicaixa/clonagem'

export interface ResultadoRecebimento {
  sucesso: boolean
  erro?: string
  /** Onde ficou o zip do que havia nesta máquina antes de sobrescrever. */
  copiaDeSeguranca?: string
}

const TIMEOUT_DOWNLOAD_MS = 120_000

/**
 * Puxa o banco da máquina de origem e o instala aqui.
 *
 * A ordem importa: **primeiro** grava a cópia de segurança do que existe,
 * **depois** baixa, **por último** restaura. Gravar a segurança só depois do
 * download deixaria uma janela em que o banco antigo já não tem cópia e o novo
 * ainda não chegou.
 */
export async function receberBancoDe(
  enderecoBruto: string,
  codigo: string,
  portaPadrao: number,
  senhaRestauracao: string
): Promise<ResultadoRecebimento> {
  let temporario: string | null = null
  try {
    const base = normalizarEndereco(enderecoBruto, portaPadrao)

    // ── A senha de restauração ────────────────────────────────────────────────
    // Sobrescrever o banco é a mesma coisa que restaurar um backup, e restaurar
    // exige senha nesta instalação. A tela de onde isto é chamado fica ANTES do
    // login, então sem esta conferência qualquer pessoa com acesso físico à
    // máquina apagaria os dados dela.
    //
    // A exigência é condicional porque o caso principal é máquina recém
    // instalada, que ainda não tem senha nenhuma e não tem o que perder. Exigir
    // sempre bloquearia justamente o uso para o qual isto foi feito.
    if (temSenhaConfigurada() && !(await verificarSenha(senhaRestauracao))) {
      return {
        sucesso: false,
        erro: 'Senha de restauração incorreta. É a mesma usada para restaurar backups.'
      }
    }

    const seguranca = await fazerBackupManual()
    if (!seguranca.sucesso) {
      // Sem rede de segurança, não prossegue. Preferir não fazer do que fazer
      // sem volta.
      return {
        sucesso: false,
        erro:
          'Não foi possível guardar uma cópia dos dados atuais deste computador, ' +
          'e sem isso a operação não pode continuar. Verifique a pasta de backups.'
      }
    }

    const zip = await baixarZip(base, codigo)
    if (!zip.ok) return { sucesso: false, erro: zip.erro, copiaDeSeguranca: seguranca.caminhoZip }

    temporario = join(app.getPath('temp'), `clone_recebido_${Date.now()}.zip`)
    writeFileSync(temporario, zip.dados)

    const restauracao = await restaurarBackup(temporario)
    if (!restauracao.sucesso) {
      return {
        sucesso: false,
        erro: restauracao.erro ?? 'Falha ao instalar os dados recebidos.',
        copiaDeSeguranca: seguranca.caminhoZip
      }
    }

    return { sucesso: true, copiaDeSeguranca: seguranca.caminhoZip }
  } catch (erro) {
    return { sucesso: false, erro: (erro as Error).message }
  } finally {
    if (temporario && existsSync(temporario)) rmSync(temporario, { force: true })
  }
}

async function baixarZip(
  base: string,
  codigo: string
): Promise<{ ok: true; dados: Buffer } | { ok: false; erro: string }> {
  const cancelador = new AbortController()
  // Tempo generoso: um banco de loja grande com anos de histórico não vem em 10
  // segundos, e esta é uma operação que a pessoa está olhando acontecer.
  const relogio = setTimeout(() => cancelador.abort(), TIMEOUT_DOWNLOAD_MS)
  try {
    const resposta = await fetch(`${base}/clonar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, versao: app.getVersion() }),
      signal: cancelador.signal
    })

    if (!resposta.ok) {
      let erro = RECUSA_CLONAGEM['codigo-errado']
      try {
        const corpo = (await resposta.json()) as { erro?: string; motivo?: MotivoRecusaClonagem }
        if (corpo.erro) erro = corpo.erro
      } catch {
        // Resposta sem JSON (404 de servidor que não oferece clonagem, por ex.).
        if (resposta.status === 404) {
          erro = 'O computador de origem não está aguardando uma cópia. Gere o código nele.'
        }
      }
      return { ok: false, erro }
    }

    const dados = Buffer.from(await resposta.arrayBuffer())
    if (dados.length === 0) return { ok: false, erro: 'A cópia recebida está vazia.' }
    return { ok: true, dados }
  } catch (erro) {
    const nome = (erro as Error).name
    if (nome === 'AbortError') {
      return { ok: false, erro: 'A cópia demorou demais e foi interrompida. Tente novamente.' }
    }
    return {
      ok: false,
      erro:
        'Não foi possível falar com o computador de origem. Confira se os dois estão na mesma ' +
        'rede e se o endereço está correto.'
    }
  } finally {
    clearTimeout(relogio)
  }
}
