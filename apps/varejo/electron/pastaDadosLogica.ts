import { existsSync, renameSync, statSync } from 'fs'
import { basename, dirname, join, sep } from 'path'

// Lógica de resolução/migração da pasta de dados, separada do wrapper Electron
// (pastaDados.ts) pra ser testável: better-sqlite3 é um addon nativo compilado
// pro Electron e não carrega no runtime dos testes (Node) — ver a nota em
// backup/__tests__/migrations.test.ts. Por isso o leitor de banco entra
// injetado (ContadorRegistros) e os testes usam um leitor node:sqlite com a
// mesma semântica.

// Nome oficial da pasta de dados (%APPDATA%\<nome>) e os nomes que o app já
// usou ao longo das versões. Segue a convenção dos outros nichos
// ("FHVP Tech Assistencia") — cada app tem a sua, nunca compartilham.
export const PASTA_OFICIAL = 'FHVP Tech Varejo'
export const PASTAS_LEGADAS = ['Sistema RT', 'sistema-rt']

// Conta registros "de negócio" num banco candidato. Banco ausente, ilegível ou
// recém-criado (sem produtos/clientes/vendas) deve contar 0 = "sem dados".
export type ContadorRegistros = (caminhoBanco: string) => number

export function resolverPastaDadosEm(base: string, contar: ContadorRegistros): string {
  const oficial = join(base, PASTA_OFICIAL)

  try {
    const comDados = [PASTA_OFICIAL, ...PASTAS_LEGADAS]
      .map((nome) => join(base, nome))
      .map((pasta) => ({ pasta, banco: join(pasta, 'database.sqlite') }))
      .filter(({ banco }) => existsSync(banco) && contar(banco) > 0)
      .map(({ pasta, banco }) => ({ pasta, mtime: statSync(banco).mtimeMs }))

    if (comDados.length > 0) {
      // Entre as pastas COM dados, usa a de banco modificado mais recentemente —
      // a que o cliente realmente estava usando.
      comDados.sort((a, b) => b.mtime - a.mtime)
      const eleita = comDados[0].pasta
      if (basename(eleita) === PASTA_OFICIAL) return eleita

      // A pasta com dados tem nome legado: renomeia pro nome oficial. rename no
      // mesmo volume é atômico — ou a pasta inteira muda de nome, ou nada
      // acontece; nunca copiamos nem apagamos. Se algo estiver segurando a
      // pasta (instância antiga aberta com o banco, antivírus), o Windows
      // recusa e seguimos na legada neste boot; tentamos de novo no próximo.
      // Se a oficial já existe (não pode receber o rename), também seguimos na
      // legada — sem apagar nada de nenhum dos lados.
      if (!existsSync(oficial)) {
        try {
          renameSync(eleita, oficial)
          return oficial
        } catch {
          return eleita
        }
      }
      return eleita
    }
  } catch {
    // Qualquer imprevisto: cai no padrão (instalação nova), nunca trava o boot.
  }

  return oficial
}

export type ConfigStore = {
  ler: (chave: string) => string
  gravar: (chave: string, valor: string) => void
}

// Conserta caminhos de backup gravados na config que ficaram apontando pra
// pasta de dados errada. Dois jeitos de isso acontecer: (a) a pasta desta
// instalação acabou de ser renomeada de "Sistema RT" pro nome oficial; (b) o
// banco veio de um restore feito com backup de OUTRA máquina e trouxe o
// caminho de lá. Roda depois das migrations e antes do BackupManager, e só
// age quando o userData atual já é o oficial.
export function corrigirCaminhosBackup(userDataAtual: string, config: ConfigStore): void {
  if (basename(userDataAtual) !== PASTA_OFICIAL) return

  // backup_pasta_padrao nunca é escolhida pelo lojista — é sempre o
  // `<userData>\Backups` de ALGUMA instalação (o BackupManager semeia quando
  // vazia; a tela de Configurações só exibe). Então qualquer valor no formato
  // de default que não seja o desta instalação está errado e pode ser
  // corrigido sem medo de atropelar escolha do usuário.
  const padraoDesta = join(userDataAtual, 'Backups')
  const padrao = config.ler('backup_pasta_padrao')
  if (padrao && padrao !== padraoDesta && pareceBackupsDeInstalacao(padrao)) {
    config.gravar('backup_pasta_padrao', padraoDesta)
  }

  // backup_pasta_secundaria É escolhida pelo lojista (espelho, normalmente em
  // outro disco) — só mexe se estava DENTRO da pasta de dados legada desta
  // mesma base, que acabou de mudar de nome.
  const secundaria = config.ler('backup_pasta_secundaria')
  if (secundaria) {
    const base = dirname(userDataAtual)
    for (const legado of PASTAS_LEGADAS) {
      const prefixo = join(base, legado)
      if (secundaria === prefixo || secundaria.startsWith(prefixo + sep)) {
        config.gravar('backup_pasta_secundaria', join(userDataAtual, secundaria.slice(prefixo.length + 1)))
        break
      }
    }
  }
}

// `<qualquer base>\<nome oficial ou legado>\Backups` — o formato que o
// BackupManager semeia, desta ou de outra máquina.
function pareceBackupsDeInstalacao(caminho: string): boolean {
  const c = caminho.toLowerCase()
  return [PASTA_OFICIAL, ...PASTAS_LEGADAS].some((nome) =>
    c.endsWith(`${sep}${nome}${sep}backups`.toLowerCase())
  )
}
