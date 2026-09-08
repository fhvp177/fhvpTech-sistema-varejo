// Testes do backup em nuvem das lojas instaladas.
// node:test + node:assert (nativos), igual ao dispositivos.test.ts.
// Rodar: npx tsx --test src/backupNuvem.test.ts
//
// O que estes testes seguram:
//   • LOJA SEM O CAMPO NÃO SOBE NADA. Aqui "ausente" significa NÃO, ao
//     contrário da cota de notas e do limite de máquinas — porque este campo
//     concede em vez de restringir. Ler ausência como "pode" faria toda loja
//     instalada começar a mandar a base de clientes dela para a nossa infra sem
//     ninguém ter combinado.
//   • UMA LOJA NÃO ALCANÇA O BACKUP DA OUTRA. É o vazamento que mais importa:
//     dentro do arquivo está o cadastro de clientes finais, com dívida e
//     telefone.
//   • O NOME DE ARQUIVO NÃO SAI DO PREFIXO ("../"), que é a mesma classe de
//     erro que faz servidor de arquivos entregar o que não devia.
//   • A ASSINATURA É ESTÁVEL: mesma entrada, mesma saída. Assinatura errada não
//     dá erro visível — dá 403 e o envio falha em silêncio, e o dono só
//     descobre no dia em que precisa do backup.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  avaliarEnvio,
  chaveDoObjeto,
  lojaTemBackupNuvem,
  nomeDeArquivoValido,
  objetoPertenceALoja,
  prefixoDaLoja,
  TAMANHO_MAXIMO_BYTES
} from './backupNuvem.ts'
import { urlAssinada, type CredenciaisR2 } from './presignR2.ts'

// ── Quem pode ────────────────────────────────────────────────────────────────

test('★ loja SEM o campo não tem backup em nuvem', () => {
  // O estado de toda loja instalada hoje. Se isto virar `true`, todas passam a
  // subir dados de clientes finais sem contrato.
  assert.equal(lojaTemBackupNuvem({ clienteId: 'X' } as never), false)
  assert.equal(lojaTemBackupNuvem(null), false)
  assert.equal(lojaTemBackupNuvem(undefined), false)
})

test('só o `true` explícito concede', () => {
  assert.equal(lojaTemBackupNuvem({ backupNuvem: true }), true)
  assert.equal(lojaTemBackupNuvem({ backupNuvem: false }), false)
  // Nada de valor "quase verdadeiro" abrindo a porta.
  assert.equal(lojaTemBackupNuvem({ backupNuvem: 1 as never }), false)
  assert.equal(lojaTemBackupNuvem({ backupNuvem: 'sim' as never }), false)
})

test('a recusa de quem não contratou vem ANTES de qualquer outra', () => {
  // Quem não tem o recurso não descobre nada sobre limites nem formatos.
  const r = avaliarEnvio({ clienteId: 'A' }, { nomeArquivo: '../x', tamanhoBytes: -5 })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 403)
})

// ── O caminho ────────────────────────────────────────────────────────────────

test('★ o nome de arquivo não pode escapar do prefixo da loja', () => {
  assert.equal(nomeDeArquivoValido('../outra-loja/backup.zip'), false)
  assert.equal(nomeDeArquivoValido('..%2Fbackup.zip'), false)
  assert.equal(nomeDeArquivoValido('sub/backup.zip'), false)
  assert.equal(nomeDeArquivoValido('back..up.zip'), false)
  // E o que é legítimo continua passando.
  assert.equal(nomeDeArquivoValido('backup-2026-09-08-1042.zip'), true)
})

test('só .zip entra', () => {
  assert.equal(nomeDeArquivoValido('backup.exe'), false)
  assert.equal(nomeDeArquivoValido('backup.zip.exe'), false)
  assert.equal(nomeDeArquivoValido('BACKUP.ZIP'), true)
})

test('★ uma loja NÃO alcança o objeto da outra', () => {
  assert.equal(objetoPertenceALoja('lojas/LOJA-A/backup.zip', 'LOJA-A'), true)
  assert.equal(objetoPertenceALoja('lojas/LOJA-B/backup.zip', 'LOJA-A'), false)
  // O caso que `startsWith` sozinho deixaria passar: um id que começa igual.
  assert.equal(objetoPertenceALoja('lojas/LOJA-AB/backup.zip', 'LOJA-A'), false)
  // E a travessia por dentro do próprio prefixo.
  assert.equal(objetoPertenceALoja('lojas/LOJA-A/../LOJA-B/backup.zip', 'LOJA-A'), false)
})

test('o caminho é montado a partir do clienteId, não do que o app mandou', () => {
  assert.equal(prefixoDaLoja('GNMODAS'), 'lojas/GNMODAS/')
  assert.equal(chaveDoObjeto('GNMODAS', 'backup.zip'), 'lojas/GNMODAS/backup.zip')
})

// ── O tamanho ────────────────────────────────────────────────────────────────

test('arquivo acima do teto é recusado com 413', () => {
  const r = avaliarEnvio(
    { clienteId: 'A', backupNuvem: true },
    { nomeArquivo: 'backup.zip', tamanhoBytes: TAMANHO_MAXIMO_BYTES + 1 }
  )
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 413)
})

test('tamanho ausente ou zero não passa', () => {
  for (const t of [0, -1, null, undefined, 'grande']) {
    const r = avaliarEnvio(
      { clienteId: 'A', backupNuvem: true },
      { nomeArquivo: 'backup.zip', tamanhoBytes: t }
    )
    assert.equal(r.ok, false, `tamanho ${String(t)} deveria ser recusado`)
  }
})

test('o caminho aprovado sai pronto, dentro do prefixo da loja', () => {
  const r = avaliarEnvio(
    { clienteId: 'LOJA-A', backupNuvem: true },
    { nomeArquivo: 'backup-2026-09-08.zip', tamanhoBytes: 480 * 1024 }
  )
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.chaveObjeto, 'lojas/LOJA-A/backup-2026-09-08.zip')
})

// ── A assinatura ─────────────────────────────────────────────────────────────

const CRED: CredenciaisR2 = {
  contaId: 'conta123',
  chaveId: 'AKIAEXEMPLO',
  segredo: 'segredoexemplo',
  bucket: 'backups-fhvptech'
}
const HORA = new Date('2026-09-08T12:00:00.000Z')

test('★ a assinatura é estável: mesma entrada, mesma saída', () => {
  // Se este valor mudar sem que alguém tenha mexido de propósito, a mudança
  // quebra TODO envio — e em silêncio, com HTTP 403.
  const a = urlAssinada({
    metodo: 'PUT',
    cred: CRED,
    chaveObjeto: 'lojas/LOJA-A/backup.zip',
    expiraEmSegundos: 900,
    agora: HORA
  })
  const b = urlAssinada({
    metodo: 'PUT',
    cred: CRED,
    chaveObjeto: 'lojas/LOJA-A/backup.zip',
    expiraEmSegundos: 900,
    agora: HORA
  })
  assert.equal(a, b)
  assert.match(a, /^https:\/\/conta123\.r2\.cloudflarestorage\.com\/backups-fhvptech\//)
  assert.match(a, /X-Amz-Signature=[a-f0-9]{64}$/)
  assert.match(a, /X-Amz-Expires=900/)
})

test('assinatura muda quando o objeto, o método ou a hora mudam', () => {
  const base = {
    metodo: 'PUT' as const,
    cred: CRED,
    chaveObjeto: 'lojas/LOJA-A/backup.zip',
    expiraEmSegundos: 900,
    agora: HORA
  }
  const original = urlAssinada(base)
  assert.notEqual(original, urlAssinada({ ...base, chaveObjeto: 'lojas/LOJA-B/backup.zip' }))
  assert.notEqual(original, urlAssinada({ ...base, metodo: 'GET' }))
  assert.notEqual(original, urlAssinada({ ...base, agora: new Date('2026-09-08T13:00:00.000Z') }))
})

test('★ a barra do caminho NÃO é escapada, mas o resto é', () => {
  // `encodeURIComponent` na chave inteira viraria `lojas%2F...`, que é outro
  // objeto — a assinatura valeria para um caminho que ninguém quis.
  const u = urlAssinada({
    metodo: 'GET',
    cred: CRED,
    chaveObjeto: 'lojas/LOJA-A/backup 1.zip',
    expiraEmSegundos: 60,
    agora: HORA
  })
  assert.ok(u.includes('/backups-fhvptech/lojas/LOJA-A/backup%201.zip?'))
})
