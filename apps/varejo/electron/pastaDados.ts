import Database from 'better-sqlite3'
import { app } from 'electron'
import { gravarConfig, lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { corrigirCaminhosBackup, resolverPastaDadosEm } from './pastaDadosLogica'

// Resolve qual pasta de dados (userData) o app deve usar no boot — e, desde a
// migração de marca, renomeia a pasta legada pro nome oficial ("FHVP Tech
// Varejo") quando dá pra fazer isso com segurança.
//
// Contexto do bug que a resolução conserta: até a 1.11.0 o Electron gravava em
// `%APPDATA%\sistema-rt` (o `name` do pacote). A 1.11.1 fixou o userData em
// "Sistema RT" achando que era esse o nome antigo — mas não era. Resultado:
// máquinas que pulavam de uma versão antiga direto pra 1.11.1+ passavam a abrir
// "Sistema RT" (vazia) e pareciam ter perdido tudo (pediam licença do zero).
// Por isso a regra de ouro daqui: quem manda é a pasta que TEM dados, e a
// migração de nome é um rename atômico (nunca cópia) com fallback pra pasta
// legada se o Windows recusar. A lógica e os cenários estão em
// pastaDadosLogica.ts, com testes em __tests__/pastaDadosLogica.test.ts.
//
// Atenção pro par com os scripts de socorro (recuperar-dados.bat etc.): eles
// precisam conhecer TODOS os nomes de pasta, o oficial e os legados.

// Conta registros "de negócio" num banco candidato. Banco ausente, ilegível ou
// recém-criado (sem produtos/clientes/vendas) conta 0 = "sem dados".
function contarRegistros(caminhoBanco: string): number {
  try {
    const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
    try {
      const r = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM produtos)
                + (SELECT COUNT(*) FROM clientes)
                + (SELECT COUNT(*) FROM vendas) AS n`
        )
        .get() as { n: number } | undefined
      return r?.n ?? 0
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

export function resolverPastaDados(): string {
  return resolverPastaDadosEm(app.getPath('appData'), contarRegistros)
}

// Roda depois das migrations (precisa do banco aberto) e antes do
// BackupManager: conserta backup_pasta_padrao/secundaria que apontem pra pasta
// de nome legado — desta instalação (recém-renomeada) ou de outra máquina
// (banco restaurado de backup alheio traz o caminho de lá).
export function corrigirCaminhosBackupLegados(): void {
  corrigirCaminhosBackup(app.getPath('userData'), { ler: lerConfig, gravar: gravarConfig })
}
