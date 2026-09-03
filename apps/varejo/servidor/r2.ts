/**
 * Envio de arquivo para o R2 (o armazenamento da Cloudflare).
 *
 * ── Por que assinar à mão em vez de usar um SDK ──────────────────────────────
 * Mesma escolha já feita em `scripts/publicar-r2.js`, que publica os
 * instaladores: um PUT assinado cabe em cem linhas de Node puro, e o R2 aceita
 * objeto de até 5 GB num PUT só. Trazer o SDK da AWS para isso somaria dezenas
 * de megabytes de dependência ao contêiner do servidor — e o publicador de
 * instaladores já provou, com o upload multiparte, que o SDK traz problemas
 * próprios contra o R2.
 *
 * ── Por que a assinatura é uma função separada ───────────────────────────────
 * Assinatura errada não dá erro visível: dá HTTP 403, o envio falha em
 * silêncio, e ninguém percebe até o dia em que o backup é necessário — que é o
 * pior dia possível para descobrir. Sendo função pura, com hora fixa entrando
 * por parâmetro, ela é conferida por teste contra um valor conhecido.
 */
import { createHash, createHmac } from 'node:crypto'
import { request } from 'node:https'

export interface CredenciaisR2 {
  /** Id da conta Cloudflare — é ele que forma o endereço do serviço. */
  contaId: string
  chaveId: string
  segredo: string
  bucket: string
}

const sha256hex = (d: string | Buffer): string => createHash('sha256').update(d).digest('hex')
const hmac = (k: string | Buffer, d: string): Buffer => createHmac('sha256', k).update(d).digest()

export function hostDoR2(contaId: string): string {
  return `${contaId}.r2.cloudflarestorage.com`
}

/**
 * Monta caminho e cabeçalhos de um PUT assinado (AWS SigV4, região `auto`).
 *
 * `agora` entra por parâmetro porque a assinatura depende do instante: sem
 * isso, não haveria como comparar o resultado com um valor conhecido no teste.
 */
export function assinarPut(
  cred: CredenciaisR2,
  chaveObjeto: string,
  corpo: Buffer,
  contentType: string,
  agora: Date
): { caminho: string; headers: Record<string, string | number> } {
  return assinar('PUT', cred, chaveObjeto, '', corpo, agora, contentType)
}

/**
 * A assinatura de qualquer método.
 *
 * `consulta` é a parte depois do `?`, já ordenada — a conta canônica exige as
 * chaves em ordem alfabética, e trocar a ordem muda a assinatura. Vazia no PUT
 * e no GET de objeto; usada só na listagem.
 */
export function assinar(
  metodo: 'PUT' | 'GET',
  cred: CredenciaisR2,
  chaveObjeto: string,
  consulta: string,
  corpo: Buffer,
  agora: Date,
  contentType?: string
): { caminho: string; headers: Record<string, string | number> } {
  const caminho =
    `/${cred.bucket}` + (chaveObjeto ? '/' + chaveObjeto.split('/').map(encodeURIComponent).join('/') : '')
  const amzDate = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dataStamp = amzDate.slice(0, 8)
  const host = hostDoR2(cred.contaId)
  const payloadHash = sha256hex(corpo)

  const headersCanon = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const reqCanon = [metodo, caminho, consulta, headersCanon, signedHeaders, payloadHash].join('\n')
  const escopo = `${dataStamp}/auto/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(reqCanon)].join('\n')
  const kAssin = hmac(hmac(hmac(hmac(`AWS4${cred.segredo}`, dataStamp), 'auto'), 's3'), 'aws4_request')
  const assinatura = createHmac('sha256', kAssin).update(stringToSign).digest('hex')

  const headers: Record<string, string | number> = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${cred.chaveId}/${escopo}, SignedHeaders=${signedHeaders}, Signature=${assinatura}`
  }
  // Só o envio manda corpo. Pôr `content-length: 0` num GET faria alguns
  // intermediários tratarem a requisição como tendo corpo vazio declarado, o
  // que é diferente de não ter corpo.
  if (metodo === 'PUT') {
    headers['content-type'] = contentType ?? 'application/octet-stream'
    headers['content-length'] = corpo.length
  }

  return { caminho, headers }
}

/** Sobe um objeto. Lança com o corpo da resposta quando o R2 recusa. */
export function enviarParaR2(
  cred: CredenciaisR2,
  chaveObjeto: string,
  corpo: Buffer,
  contentType = 'application/octet-stream'
): Promise<void> {
  const { caminho, headers } = assinarPut(cred, chaveObjeto, corpo, contentType, new Date())
  const host = hostDoR2(cred.contaId)

  return new Promise((resolve, reject) => {
    const req = request({ host, method: 'PUT', path: caminho, headers }, (res) => {
      let dados = ''
      res.on('data', (c) => (dados += c))
      res.on('end', () =>
        res.statusCode === 200
          ? resolve()
          : reject(new Error(`R2 respondeu ${res.statusCode} em ${chaveObjeto}: ${dados.slice(0, 300)}`))
      )
    })
    req.on('error', reject)
    req.end(corpo)
  })
}


/** Um backup que está guardado na nuvem. */
export interface ObjetoNaNuvem {
  /** Caminho completo dentro do bucket. */
  chave: string
  tamanhoBytes: number
  /** Quando o R2 recebeu, em ISO. */
  quando: string
}

/**
 * Lê a resposta XML da listagem.
 *
 * Com expressão regular, e não com um analisador de XML: a resposta tem três
 * campos por item, formato fixo, e trazer uma biblioteca inteira para isso
 * somaria peso ao contêiner sem resolver nada que estas quatro linhas não
 * resolvam. Se um dia o formato ficar complicado, aqui é o lugar de mudar de
 * ideia.
 */
export function lerListagem(xml: string): ObjetoNaNuvem[] {
  const itens: ObjetoNaNuvem[] = []
  for (const bloco of xml.split('<Contents>').slice(1)) {
    const chave = /<Key>([^<]*)<\/Key>/.exec(bloco)?.[1]
    if (!chave) continue
    itens.push({
      chave,
      tamanhoBytes: Number(/<Size>(\d+)<\/Size>/.exec(bloco)?.[1] ?? 0),
      quando: /<LastModified>([^<]*)<\/LastModified>/.exec(bloco)?.[1] ?? ''
    })
  }
  return itens
}

function pedir(
  cred: CredenciaisR2,
  caminho: string,
  consulta: string,
  headers: Record<string, string | number>
): Promise<{ status: number; corpo: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: hostDoR2(cred.contaId), method: 'GET', path: caminho + (consulta ? '?' + consulta : ''), headers },
      (res) => {
        const pedacos: Buffer[] = []
        res.on('data', (p: Buffer) => pedacos.push(p))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(pedacos) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * O que existe guardado sob um prefixo, do mais recente para o mais antigo.
 *
 * A ordenação é feita aqui e não pelo R2: a listagem dele sai em ordem
 * alfabética de chave, e como o nome do backup começa pela data isso quase
 * coincide — "quase" não serve para quem está escolhendo de onde restaurar.
 */
export async function listarNoR2(cred: CredenciaisR2, prefixo: string): Promise<ObjetoNaNuvem[]> {
  const consulta = `list-type=2&prefix=${encodeURIComponent(prefixo)}`
  const { caminho, headers } = assinar('GET', cred, '', consulta, Buffer.alloc(0), new Date())

  const { status, corpo } = await pedir(cred, caminho, consulta, headers)
  if (status !== 200) {
    throw new Error(`R2 respondeu ${status} ao listar ${prefixo}: ${corpo.toString().slice(0, 300)}`)
  }
  return lerListagem(corpo.toString('utf8')).sort((a, b) => b.quando.localeCompare(a.quando))
}

/** Traz um objeto de volta. Lança quando o R2 recusa. */
export async function baixarDoR2(cred: CredenciaisR2, chaveObjeto: string): Promise<Buffer> {
  const { caminho, headers } = assinar('GET', cred, chaveObjeto, '', Buffer.alloc(0), new Date())

  const { status, corpo } = await pedir(cred, caminho, '', headers)
  if (status !== 200) {
    throw new Error(`R2 respondeu ${status} ao baixar ${chaveObjeto}: ${corpo.toString().slice(0, 300)}`)
  }
  return corpo
}

/**
 * Credenciais do ambiente, ou `null` quando o envio não está configurado.
 *
 * `null` não é erro: uma instalação pode rodar sem backup na nuvem (o
 * desenvolvimento local roda). Quem chama decide o que fazer com a ausência —
 * e o servidor avisa alto no boot, porque em produção isso é grave.
 */
export function credenciaisDoAmbiente(): CredenciaisR2 | null {
  const contaId = process.env.R2_ACCOUNT_ID
  const chaveId = process.env.R2_ACCESS_KEY_ID
  const segredo = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_BACKUPS
  if (!contaId || !chaveId || !segredo || !bucket) return null
  return { contaId, chaveId, segredo, bucket }
}
