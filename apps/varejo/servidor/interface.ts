/**
 * Qual arquivo da interface responde a um caminho pedido pelo navegador.
 *
 * Separado do servidor porque é a única parte dele que decide se um pedido pode
 * ou não chegar ao disco — e essa decisão precisa de teste. O resto de
 * `index.ts` é encanamento de HTTP.
 *
 * ── A regra ──────────────────────────────────────────────────────────────────
 * O caminho vem de fora, então tem que ser conferido DEPOIS de resolvido, não
 * antes: `/assets/../../.env` só se revela quando os `..` são aplicados. Por
 * isso a ordem é sempre juntar, normalizar, e só então perguntar se o resultado
 * ainda está dentro da pasta.
 *
 * ── O detalhe que já custou um bug ───────────────────────────────────────────
 * A pasta de saída chega por variável de ambiente, e um caminho com barra
 * normal (`C:/loja/web`) é perfeitamente válido de se escrever. Só que a
 * conferência compara texto com texto: sem normalizar a RAIZ também,
 * `C:/loja/web` nunca é prefixo de `C:\loja\web\assets\app.js`, e o servidor
 * devolve 404 para a interface inteira — deixando passar só o `index.html`, que
 * é comparado à parte. O sintoma é cruel: a página abre, em branco, sem erro
 * nenhum no servidor.
 *
 * Daí `raizDaInterface()` existir: normalizar a raiz é parte da regra, não
 * responsabilidade de quem chama.
 */
import { existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'

/** Tipos que a interface compilada usa. O resto desce como binário genérico. */
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}

export function tipoDoArquivo(caminho: string): string {
  return TIPOS[extname(caminho).toLowerCase()] ?? 'application/octet-stream'
}

/** Normaliza a pasta de saída. Sempre passe por aqui — ver o cabeçalho. */
export function raizDaInterface(bruto: string | undefined): string {
  return resolve(bruto ?? 'dist-web')
}

/**
 * O arquivo que atende `caminhoUrl`, ou `null` quando não há um.
 *
 * `null` cobre três casos que, do lado de fora, são o mesmo 404: o pedido tenta
 * sair da pasta, o arquivo não existe, ou o caminho aponta para uma pasta.
 * Distinguir os três na resposta contaria a quem está sondando o que existe no
 * disco.
 *
 * @param existe Injetado só para o teste conseguir montar uma árvore de
 *   arquivos imaginária sem escrever nada em disco.
 */
export function arquivoDaInterface(
  raiz: string,
  caminhoUrl: string,
  existe: (caminho: string) => boolean = (c) => existsSync(c) && statSync(c).isFile()
): string | null {
  let relativo: string
  try {
    relativo = caminhoUrl === '/' ? 'index.html' : decodeURIComponent(caminhoUrl.replace(/^\/+/, ''))
  } catch {
    // `%` solto derruba o decodeURIComponent. Pedido malformado é 404.
    return null
  }

  // Byte nulo trunca o caminho em algumas camadas de sistema de arquivos — o
  // truque clássico para fazer "app.js\0.txt" virar "app.js".
  if (relativo.includes('\0')) return null

  const alvo = normalize(join(raiz, relativo))
  const dentro = alvo === raiz || alvo.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)
  if (!dentro) return null

  return existe(alvo) ? alvo : null
}
