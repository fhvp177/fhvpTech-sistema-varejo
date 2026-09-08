/**
 * Backup em nuvem das lojas INSTALADAS (o aplicativo no PC do lojista).
 *
 * ── O problema que este módulo resolve, e por que ele mora aqui ─────────────
 * A loja hospedada já sobe o banco para o R2 sozinha, porque o contêiner é
 * nossa infra e as credenciais chegam nele por variável de ambiente. No
 * desktop isso não existe: a máquina é do cliente.
 *
 * ⚠️ E a chave do bucket NÃO pode ir para lá. Quem tem a credencial do R2
 * alcança o prefixo inteiro — ou seja, o backup de TODAS as lojas. Bastaria um
 * cliente curioso extrair a string do binário. Não é hipótese remota: é o
 * primeiro lugar onde alguém procura.
 *
 * Então a credencial fica só aqui, no servidor, e o app pede uma AUTORIZAÇÃO
 * temporária: um endereço assinado que serve para um objeto só, por alguns
 * minutos. O app nunca vê a chave, e o prefixo é decidido AQUI a partir da
 * chave de licença que ele apresentou — nunca do que ele mandou.
 *
 * ── ⚠️ Por que o prefixo não pode vir do cliente ────────────────────────────
 * Se o app dissesse "quero gravar em lojas/X/backup.zip", bastaria trocar o X
 * para escrever por cima do backup de outra loja, ou para ler o dela. O
 * `clienteId` sai da conferência do HMAC da licença e o caminho é montado a
 * partir dele; o que o app escolhe é só o NOME do arquivo, e ainda assim
 * dentro de um formato estreito.
 *
 * ── O que este módulo NÃO faz ───────────────────────────────────────────────
 * Não fala HTTP, não conhece banco e não assina nada: recebe os dados prontos e
 * responde se pode e qual é o caminho. A assinatura mora em `presignR2.ts`, e
 * as rotas em `index.ts`. Assim as regras que decidem acesso a dado de cliente
 * são testáveis sem subir servidor.
 */

/**
 * Teto do que a nuvem aceita por arquivo.
 *
 * Um backup medido de cliente real (JM Peças) tem 480 KB; a estimativa mais
 * pesada, de uma loja com um ano de nota fiscal no banco, chega a ~15 MB. O
 * teto de 100 MB está aqui para barrar o acidente e o abuso — arquivo trocado,
 * envio repetido em laço — sem apertar o uso normal.
 *
 * ⚠️ Existir teto no SERVIDOR é o ponto: o app também confere, mas quem chama
 * pode não ser o app.
 */
export const TAMANHO_MAXIMO_BYTES = 100 * 1024 * 1024

/**
 * Quantos minutos a autorização vale.
 *
 * Curto porque ela é um poder: quem tiver o endereço grava naquele objeto.
 * Longo o bastante para uma conexão ruim terminar o envio de alguns megabytes.
 */
export const MINUTOS_DE_VALIDADE = 15

/** O prefixo de uma loja. Toda leitura e escrita dela vive dentro dele. */
export function prefixoDaLoja(clienteId: string): string {
  return `lojas/${clienteId}/`
}

/**
 * O nome de arquivo que a loja escolheu é aceitável?
 *
 * ⚠️ A recusa de `..` e de `/` não é frescura de validação: o nome vira caminho
 * dentro do bucket, e "../outra-loja/backup.zip" sairia do prefixo desta loja.
 * É a mesma classe de erro que faz um servidor de arquivos entregar o /etc/passwd.
 */
export function nomeDeArquivoValido(nome: unknown): nome is string {
  if (typeof nome !== 'string') return false
  if (nome.length < 5 || nome.length > 120) return false
  if (!/^[A-Za-z0-9._-]+$/.test(nome)) return false
  if (nome.includes('..')) return false
  return nome.toLowerCase().endsWith('.zip')
}

/** O caminho completo do objeto desta loja. Nunca aceita caminho pronto. */
export function chaveDoObjeto(clienteId: string, nomeArquivo: string): string {
  return prefixoDaLoja(clienteId) + nomeArquivo
}

/**
 * Este objeto é mesmo desta loja?
 *
 * Usado no caminho de VOLTA (baixar e apagar), onde o app manda a chave inteira
 * que recebeu da listagem. Sem esta conferência, trocar o `lojas/X/` por
 * `lojas/Y/` na mão daria a uma loja o backup da outra — o pior vazamento
 * possível aqui, porque o que está dentro é a base de clientes dela.
 *
 * ⚠️ `startsWith` sozinho não basta: `lojas/abc` é prefixo de `lojas/abcd`. Por
 * isso o prefixo termina com barra e o resto é conferido contra travessia.
 */
export function objetoPertenceALoja(chaveObjeto: unknown, clienteId: string): chaveObjeto is string {
  if (typeof chaveObjeto !== 'string') return false
  const prefixo = prefixoDaLoja(clienteId)
  if (!chaveObjeto.startsWith(prefixo)) return false
  const resto = chaveObjeto.slice(prefixo.length)
  return nomeDeArquivoValido(resto)
}

/**
 * Esta loja contratou backup em nuvem?
 *
 * ⚠️ AUSENTE É NÃO, e aqui o padrão é o contrário do resto do sistema (cota de
 * notas, limite de máquinas), onde ausência significa "sem restrição". A razão
 * é que aqui o campo não restringe: ele CONCEDE. Ler ausência como "pode" faria
 * toda loja instalada começar a subir a base de clientes dela para a nossa
 * infraestrutura sem ninguém ter combinado isso — que é exatamente o tipo de
 * coisa que não pode acontecer por padrão.
 */
export function lojaTemBackupNuvem(cliente: { backupNuvem?: boolean } | null | undefined): boolean {
  return cliente?.backupNuvem === true
}

export type ObjetoNaNuvem = {
  chave: string
  tamanhoBytes: number
  quando: string
}

/**
 * Lê a listagem XML do R2.
 *
 * Regex e não parser de XML de verdade: o formato é fixo, conhecido e nosso, e
 * trazer uma dependência para ler três campos custaria mais do que resolve.
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

export type PedidoDeEnvio = {
  nomeArquivo: unknown
  tamanhoBytes: unknown
}

export type VeredictoEnvio =
  | { ok: true; chaveObjeto: string; tamanhoBytes: number }
  | { ok: false; erro: string; status: 400 | 403 | 413 }

/**
 * A decisão inteira do envio, num lugar só.
 *
 * A ordem das recusas importa para não contar mais do que o necessário a quem
 * pergunta: primeiro "esta loja pode?" (403), depois o formato (400), depois o
 * tamanho (413). Quem não contratou não descobre nada sobre os limites.
 */
export function avaliarEnvio(
  cliente: { clienteId: string; backupNuvem?: boolean } | null | undefined,
  pedido: PedidoDeEnvio
): VeredictoEnvio {
  if (!cliente) return { ok: false, erro: 'cliente não encontrado', status: 403 }
  if (!lojaTemBackupNuvem(cliente)) {
    return {
      ok: false,
      erro: 'esta loja não tem backup em nuvem no plano dela',
      status: 403
    }
  }
  if (!nomeDeArquivoValido(pedido.nomeArquivo)) {
    return { ok: false, erro: 'nome de arquivo inválido', status: 400 }
  }
  const tamanho = Number(pedido.tamanhoBytes)
  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return { ok: false, erro: 'tamanho inválido', status: 400 }
  }
  if (tamanho > TAMANHO_MAXIMO_BYTES) {
    return {
      ok: false,
      erro: `arquivo de ${(tamanho / 1024 / 1024).toFixed(1)} MB acima do limite de ${
        TAMANHO_MAXIMO_BYTES / 1024 / 1024
      } MB`,
      status: 413
    }
  }
  return {
    ok: true,
    chaveObjeto: chaveDoObjeto(cliente.clienteId, pedido.nomeArquivo),
    tamanhoBytes: tamanho
  }
}
