/**
 * O núcleo não pode depender do Electron — exceto onde a dependência é o
 * próprio assunto do arquivo.
 *
 * ── Por que isto é um teste, e não uma convenção ─────────────────────────────
 * Um `import { app } from 'electron'` não falha na hora de USAR. Falha na hora
 * de CARREGAR o arquivo, num processo Node comum. E como import arrasta import,
 * basta UM arquivo contaminado na cadeia para o núcleo inteiro se recusar a
 * abrir fora de uma janela do Electron.
 *
 * Isso importa porque o mesmo núcleo passa a servir o sistema pelo navegador
 * (o cliente que só tem tablet). Lá não existe `app`, não existe janela, não
 * existe `safeStorage`. O trabalho de tirar o Electron de cinco arquivos foi
 * feito uma vez; sem este teste, ele volta na primeira vez que alguém precisar
 * de um caminho de pasta e escrever a linha óbvia.
 *
 * O modo de falha é traiçoeiro: no desktop continua tudo funcionando. Só o
 * servidor quebra — e só quando alguém for subir a próxima versão dele.
 *
 * ── Fecha por padrão ─────────────────────────────────────────────────────────
 * A lista abaixo é de exceções CONHECIDAS, com motivo escrito. Arquivo novo que
 * importe 'electron' reprova até alguém decidir: ou ele sai do caminho do
 * servidor, ou entra aqui com a justificativa. Listar o que é permitido, em vez
 * de vasculhar o que é proibido, é a mesma escolha feita em multicaixa/canais.ts
 * e pelo mesmo motivo — ninguém revisa uma lista de proibições ao adicionar
 * funcionalidade.
 *
 * ── Uma cópia só ─────────────────────────────────────────────────────────────
 * Este guarda protege o core, não o varejo. Duplicá-lo na assistência daria
 * dois arquivos para manter e nenhuma segurança a mais: as duas suítes rodam no
 * mesmo repositório, e o core é o mesmo dos dois lados.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, sep } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const CORE = join(AQUI, '..', '..', '..', '..', 'packages', 'core', 'src')

/**
 * Arquivos onde o Electron é o assunto, não um detalhe — todos de mecanismo
 * exclusivo de desktop, nenhum no caminho do servidor.
 */
const EXCECOES: Record<string, string> = {
  'electron/backup/BackupAoFechar.ts':
    'Pergunta ao lojista antes de fechar a janela. Sem janela, não existe.',
  'electron/backup/BackupAutomatico.ts':
    'Reage a suspender/religar a máquina (powerMonitor). Servidor não dorme.',
  'electron/segredo.ts':
    'Cofre do sistema operacional (safeStorage). Sem importador hoje; no servidor o segredo vem do ambiente.'
}

/** `import ... from 'electron'`, `require('electron')` e o import dinâmico. */
const PADRAO_ELECTRON = /(?:from\s*['"]electron['"]|require\(\s*['"]electron['"]\s*\)|import\(\s*['"]electron['"]\s*\))/

function arquivosDoCore(dir: string): string[] {
  const encontrados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivosDoCore(caminho))
    } else if (nome.endsWith('.ts') || nome.endsWith('.tsx')) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

/** Caminho relativo ao core, sempre com barra — o teste roda no Windows. */
function chave(caminho: string): string {
  return relative(CORE, caminho).split(sep).join('/')
}

describe('o núcleo carrega fora do Electron', () => {
  const arquivos = arquivosDoCore(CORE)

  it('encontra o núcleo (se não, o resto do arquivo não prova nada)', () => {
    expect(arquivos.length).toBeGreaterThan(50)
  })

  it('só os arquivos de mecanismo de desktop importam electron', () => {
    const importam = arquivos.filter((a) => PADRAO_ELECTRON.test(readFileSync(a, 'utf8'))).map(chave)
    expect(importam.sort()).toEqual(Object.keys(EXCECOES).sort())
  })

  it('toda exceção existe de verdade — lista não guarda arquivo apagado', () => {
    const existentes = new Set(arquivos.map(chave))
    for (const caminho of Object.keys(EXCECOES)) {
      expect(existentes.has(caminho), `${caminho} está na lista mas não existe`).toBe(true)
    }
  })

  it('toda exceção tem motivo escrito', () => {
    for (const [caminho, motivo] of Object.entries(EXCECOES)) {
      expect(motivo.length, `${caminho} sem motivo`).toBeGreaterThan(20)
    }
  })

  /**
   * Os cinco que acabaram de sair. Estão nomeados um a um, e não cobertos pela
   * varredura acima, porque são o caminho que o servidor percorre para abrir o
   * banco, ler a licença e restaurar backup. Se um deles voltar a importar
   * 'electron', a mensagem tem que dizer QUAL — não "a lista mudou".
   */
  it('o caminho do servidor segue limpo', () => {
    const CAMINHO_DO_SERVIDOR = [
      'electron/db/conexao.ts',
      'electron/licenca.ts',
      'electron/backup/BackupManager.ts',
      'electron/backup/Restaurador.ts',
      'electron/multicaixa/config.ts'
    ]
    for (const caminho of CAMINHO_DO_SERVIDOR) {
      const fonte = readFileSync(join(CORE, caminho), 'utf8')
      expect(PADRAO_ELECTRON.test(fonte), `${caminho} voltou a importar electron`).toBe(false)
    }
  })

  /**
   * O núcleo pergunta onde ficam os dados através da plataforma, e a plataforma
   * é ligada pelo app no boot. Um arquivo que chame `app.getPath` direto teria
   * pulado esse fio — e é justamente o que reintroduz o bug da pasta errada.
   */
  it('ninguém no núcleo chama app.getPath direto', () => {
    const infratores = arquivos
      .filter((a) => /\bapp\.getPath\s*\(/.test(readFileSync(a, 'utf8')))
      .map(chave)
    expect(infratores).toEqual([])
  })
})
