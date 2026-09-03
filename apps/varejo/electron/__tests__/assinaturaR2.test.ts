/**
 * A assinatura do envio para o R2 tem que continuar exatamente igual.
 *
 * ── Por que isto merece teste ────────────────────────────────────────────────
 * Assinatura errada não quebra nada de forma visível: o R2 responde 403, o
 * envio falha, o servidor anota um aviso no registro e a vida segue. O backup
 * simplesmente para de sair — e ninguém descobre até o dia em que ele é
 * necessário, que é o pior dia possível para descobrir.
 *
 * ── O valor de referência não foi inventado aqui ─────────────────────────────
 * Os valores abaixo vieram de rodar o MESMO algoritmo do
 * `scripts/publicar-r2.js`, que assina os envios dos instaladores e funciona em
 * produção desde a v1.24. Ou seja: o assinador do servidor é conferido contra
 * um que comprovadamente o R2 aceita, não contra si mesmo.
 *
 * Se algum dia o R2 mudar de exigência, os dois mudam juntos — e é bom que
 * este teste reprove, porque aí a mudança é consciente.
 */
import { describe, expect, it } from 'vitest'
import { assinar, assinarPut, hostDoR2, type CredenciaisR2 } from '../../servidor/r2'

const CRED: CredenciaisR2 = {
  contaId: 'conta-de-teste',
  chaveId: 'chave-de-teste',
  segredo: 'segredo-de-teste',
  bucket: 'balde'
}
const CORPO = Buffer.from('conteudo do backup')
const OBJETO = 'lojas/LOJA1/diario/backup_2026-09-02.zip'
const QUANDO = new Date('2026-09-02T12:34:56.789Z')

/** Saída do algoritmo já em produção, com estas mesmas entradas. */
const ESPERADO = {
  caminho: '/balde/lojas/LOJA1/diario/backup_2026-09-02.zip',
  amzDate: '20260902T123456Z',
  assinatura: '820aaf587a16dd3a7df906558379e718d1e6a35bda9213371198a7199b9d2155'
}

/** Só a linha de autorização de um PUT, para comparar uma com a outra. */
function autorizacaoPut(cred = CRED, corpo = CORPO, objeto = OBJETO, quando = QUANDO): string {
  return String(assinarPut(cred, objeto, corpo, 'application/zip', quando).headers.Authorization)
}

describe('assinatura do envio ao R2', () => {
  it('bate com o assinador que já funciona em produção', () => {
    const { caminho, headers } = assinarPut(CRED, OBJETO, CORPO, 'application/zip', QUANDO)

    expect(caminho).toBe(ESPERADO.caminho)
    expect(headers['x-amz-date']).toBe(ESPERADO.amzDate)
    expect(headers.Authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=chave-de-teste/20260902/auto/s3/aws4_request, ` +
        `SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${ESPERADO.assinatura}`
    )
  })

  it('o endereço do serviço sai da conta', () => {
    expect(hostDoR2('abc123')).toBe('abc123.r2.cloudflarestorage.com')
  })

  /**
   * Uma assinatura que não muda com o conteúdo aceitaria trocar o arquivo
   * depois de assinado — e um backup adulterado é pior que backup nenhum,
   * porque parece bom.
   */
  it('muda quando o conteúdo muda', () => {
    expect(autorizacaoPut(CRED, Buffer.from('outro conteudo'))).not.toBe(autorizacaoPut())
  })

  it('muda quando o destino muda', () => {
    expect(autorizacaoPut(CRED, CORPO, 'lojas/OUTRA/diario/backup.zip')).not.toBe(autorizacaoPut())
  })

  it('muda quando o segredo muda', () => {
    expect(autorizacaoPut({ ...CRED, segredo: 'outro-segredo' })).not.toBe(autorizacaoPut())
  })

  it('muda quando a hora muda', () => {
    expect(
      autorizacaoPut(CRED, CORPO, OBJETO, new Date('2026-09-03T12:34:56.789Z'))
    ).not.toBe(autorizacaoPut())
  })

  it('o corpo é resumido no cabeçalho que o R2 confere', () => {
    const { headers } = assinarPut(CRED, OBJETO, CORPO, 'application/zip', QUANDO)
    // sha256 em hexadecimal: 64 caracteres. Vazio ou "UNSIGNED-PAYLOAD" aqui
    // significaria que o conteúdo não está sendo protegido.
    expect(String(headers['x-amz-content-sha256'])).toMatch(/^[0-9a-f]{64}$/)
    expect(headers['content-length']).toBe(CORPO.length)
  })

  it('o tamanho do caminho não engana o assinador', () => {
    // Espaço e acento no nome do arquivo têm que ser codificados igual nos dois
    // lados — no caminho enviado e no que entra na conta da assinatura. Sendo
    // montado uma vez só e reaproveitado, não há como divergirem.
    const { caminho } = assinarPut(CRED, 'lojas/LOJA 1/diário.zip', CORPO, 'application/zip', QUANDO)
    expect(caminho).toBe('/balde/lojas/LOJA%201/di%C3%A1rio.zip')
  })
})

/**
 * ── Por que estes testes existem ────────────────────────────────────────────
 * O assinador nasceu só para PUT e depois passou a servir GET e listagem. Na
 * generalização, a linha que monta a requisição canônica ficou com o método e a
 * consulta CHUMBADOS em 'PUT' e '' — e o envio continuou funcionando, porque
 * para ele os valores fixos estavam certos. Só a listagem quebrou, com um 403
 * que não diz onde está o erro.
 *
 * Os testes de PUT passaram o tempo todo. Faltava exatamente isto: exercitar o
 * outro método.
 */
describe('a assinatura muda com o método e com a consulta', () => {
  const CORPO_VAZIO = Buffer.alloc(0)

  it('GET e PUT do mesmo objeto assinam diferente', () => {
    const g = assinar('GET', CRED, OBJETO, '', CORPO_VAZIO, QUANDO)
    const p = assinar('PUT', CRED, OBJETO, '', CORPO_VAZIO, QUANDO, 'application/zip')
    expect(g.headers.Authorization).not.toBe(p.headers.Authorization)
  })

  it('a consulta entra na conta', () => {
    const sem = assinar('GET', CRED, '', '', CORPO_VAZIO, QUANDO)
    const com = assinar('GET', CRED, '', 'list-type=2&prefix=lojas%2FNETO%2F', CORPO_VAZIO, QUANDO)
    expect(
      com.headers.Authorization,
      'a consulta está sendo ignorada — foi assim que a listagem tomou 403'
    ).not.toBe(sem.headers.Authorization)
  })

  it('e prefixos diferentes assinam diferente', () => {
    const a = assinar('GET', CRED, '', 'list-type=2&prefix=lojas%2FA%2F', CORPO_VAZIO, QUANDO)
    const b = assinar('GET', CRED, '', 'list-type=2&prefix=lojas%2FB%2F', CORPO_VAZIO, QUANDO)
    expect(a.headers.Authorization).not.toBe(b.headers.Authorization)
  })

  it('listar aponta para o balde, sem objeto', () => {
    const { caminho } = assinar('GET', CRED, '', 'list-type=2', CORPO_VAZIO, QUANDO)
    expect(caminho).toBe('/balde')
  })

  it('GET não declara corpo', () => {
    const { headers } = assinar('GET', CRED, OBJETO, '', CORPO_VAZIO, QUANDO)
    // `content-length: 0` num GET faz alguns intermediários tratarem a
    // requisição como tendo corpo vazio DECLARADO, que é diferente de não ter.
    expect(headers['content-length']).toBeUndefined()
    expect(headers['content-type']).toBeUndefined()
  })

  it('o PUT continua declarando', () => {
    const { headers } = assinar('PUT', CRED, OBJETO, '', CORPO, QUANDO, 'application/zip')
    expect(headers['content-length']).toBe(CORPO.length)
  })
})
