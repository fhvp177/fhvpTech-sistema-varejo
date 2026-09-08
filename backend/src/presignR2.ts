/**
 * Endereço assinado do R2 (AWS SigV4 na consulta, não no cabeçalho).
 *
 * ── Por que assinar na CONSULTA ─────────────────────────────────────────────
 * A assinatura por cabeçalho, que `apps/varejo/servidor/r2.ts` usa, exige que
 * quem envia tenha a credencial na mão. Aqui é o contrário do problema: quem
 * envia é o computador do lojista, e ele não pode ter credencial nenhuma.
 *
 * Assinando na consulta, o endereço inteiro vira a autorização — e ela é
 * estreita de propósito: um método, um objeto, e alguns minutos.
 *
 * ── Por que à mão, de novo ──────────────────────────────────────────────────
 * Mesma escolha do resto do sistema: o SDK da AWS somaria dezenas de megabytes
 * ao contêiner do backend para fazer uma conta de cem linhas. E o publicador de
 * instaladores já mostrou que o SDK tem problemas próprios contra o R2.
 *
 * ── ⚠️ Por que ela é função pura, com a hora entrando por parâmetro ─────────
 * Assinatura errada não dá erro visível: dá HTTP 403 e o envio falha em
 * silêncio — e ninguém descobre até o dia em que o backup é necessário, que é o
 * pior dia possível. Com `agora` por parâmetro, o resultado é comparável com um
 * valor conhecido no teste.
 */
import { createHash, createHmac } from 'node:crypto'

export interface CredenciaisR2 {
  /** Id da conta Cloudflare — é ele que forma o endereço do serviço. */
  contaId: string
  chaveId: string
  segredo: string
  bucket: string
}

const sha256hex = (d: string): string => createHash('sha256').update(d).digest('hex')
const hmac = (k: string | Buffer, d: string): Buffer => createHmac('sha256', k).update(d).digest()

export function hostDoR2(contaId: string): string {
  return `${contaId}.r2.cloudflarestorage.com`
}

/**
 * Cada segmento do caminho é escapado, mas a BARRA entre eles não.
 *
 * `encodeURIComponent` sozinho transformaria `lojas/abc/x.zip` em
 * `lojas%2Fabc%2Fx.zip`, que é outro objeto — e a assinatura passaria a valer
 * para um caminho que ninguém quis.
 */
const caminhoEscapado = (chaveObjeto: string): string =>
  chaveObjeto.split('/').map(encodeURIComponent).join('/')

/**
 * Escape da AWS para a consulta canônica.
 *
 * ⚠️ Difere de `encodeURIComponent` em três caracteres (`!`, `'`, `(`, `)`, `*`),
 * e é a diferença que faz a assinatura bater ou não.
 */
const escaparConsulta = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export type OpcoesAssinatura = {
  metodo: 'PUT' | 'GET' | 'DELETE'
  cred: CredenciaisR2
  /** Vazio assina o BUCKET, que é o que a listagem precisa. */
  chaveObjeto: string
  /**
   * Parâmetros de consulta além dos da assinatura — `list-type` e `prefix` na
   * listagem. Entram na conta canônica junto com os outros, em ordem
   * alfabética; deixá-los de fora daria 403 sem explicação.
   */
  extras?: Array<[string, string]>
  /** Quantos segundos o endereço vale a partir de `agora`. */
  expiraEmSegundos: number
  agora: Date
}

/**
 * O endereço completo, já assinado. Quem o tiver pode fazer aquele método
 * naquele objeto até expirar — e nada além disso.
 */
export function urlAssinada(o: OpcoesAssinatura): string {
  const { cred, chaveObjeto, metodo, expiraEmSegundos, agora, extras = [] } = o

  const amzDate = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dataStamp = amzDate.slice(0, 8)
  const host = hostDoR2(cred.contaId)
  const escopo = `${dataStamp}/auto/s3/aws4_request`
  const caminho = chaveObjeto
    ? `/${cred.bucket}/${caminhoEscapado(chaveObjeto)}`
    : `/${cred.bucket}`

  /*
   * A consulta canônica exige as chaves em ORDEM ALFABÉTICA. Trocar a ordem
   * muda a assinatura e o R2 devolve 403 sem dizer por quê.
   */
  const consulta = [
    ...extras,
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cred.chaveId}/${escopo}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiraEmSegundos)],
    ['X-Amz-SignedHeaders', 'host']
  ]
    .map(([k, v]) => [escaparConsulta(k), escaparConsulta(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  /*
   * `UNSIGNED-PAYLOAD` é o que permite assinar SEM ter o arquivo: o conteúdo
   * só existe na máquina do lojista, e o servidor nunca o vê. O preço é que a
   * assinatura não prende o conteúdo — por isso a autorização é curta e vale
   * para um objeto só.
   */
  const reqCanon = [
    metodo,
    caminho,
    consulta,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(reqCanon)].join('\n')
  const kAssin = hmac(
    hmac(hmac(hmac(`AWS4${cred.segredo}`, dataStamp), 'auto'), 's3'),
    'aws4_request'
  )
  const assinatura = createHmac('sha256', kAssin).update(stringToSign).digest('hex')

  return `https://${host}${caminho}?${consulta}&X-Amz-Signature=${assinatura}`
}

/** As credenciais do R2 lidas do ambiente. `null` quando não estão todas lá. */
export function credenciaisR2DoAmbiente(): CredenciaisR2 | null {
  const contaId = process.env.R2_ACCOUNT_ID
  const chaveId = process.env.R2_ACCESS_KEY_ID
  const segredo = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_BACKUPS
  if (!contaId || !chaveId || !segredo || !bucket) return null
  return { contaId, chaveId, segredo, bucket }
}
