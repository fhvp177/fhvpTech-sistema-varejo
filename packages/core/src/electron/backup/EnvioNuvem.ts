/**
 * Manda o backup do aplicativo INSTALADO para a nuvem.
 *
 * ── ★ A regra que governa este arquivo inteiro ─────────────────────────────
 * **Zero impacto para quem já está em produção.** Uma loja que não tem o
 * recurso — que hoje são todas — precisa executar exatamente o mesmo código de
 * ontem. E na loja que tem, nada aqui pode atrasar uma venda nem derrubar o
 * app.
 *
 * O que isso obriga, em concreto:
 *
 *   1. **Fora do caminho crítico.** Nada aqui é esperado por uma venda, pelo
 *      fechamento do app ou pela atualização. O backup local termina e retorna;
 *      a nuvem acontece depois, sozinha.
 *   2. **Não lança. Nunca.** Toda função pública engole o próprio erro e
 *      devolve o que aconteceu. É a lição da v1.36, quando `obterBackupManager`
 *      lançou dentro do instalador de atualização e travou o app — mesma
 *      classe de erro, e agora com rede, que falha muito mais.
 *   3. **Desligado por padrão.** Quem decide é o servidor, loja a loja, no
 *      painel. O app pergunta; ausência de resposta é "não".
 *
 * ── Onde a credencial NÃO está ─────────────────────────────────────────────
 * ⚠️ Aqui não existe chave do R2, e não pode existir: ela alcança o prefixo
 * inteiro, ou seja, o backup de todas as lojas — e o binário está na máquina do
 * cliente. O que este arquivo faz é pedir ao backend uma autorização temporária
 * para UM objeto, apresentando a chave de licença, e enviar direto para lá.
 *
 * O caminho na nuvem é decidido pelo SERVIDOR a partir da licença; este código
 * escolhe só o nome do arquivo.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import { chaveLicencaLocal } from '@fhvptech/core/electron/licenca'
import {
  pendentes,
  registrarEnviado,
  type ArquivoLocal
} from '@fhvptech/core/electron/backup/envioNuvemLogica'

/**
 * De quanto em quanto tempo a fila é varrida.
 *
 * Meia hora, e não minutos: o que muda aqui é lento (um backup por dia, mais os
 * manuais), e cada varredura é uma ida à rede. Um envio que falhou por internet
 * ruim é tentado de novo no ciclo seguinte, sem código de repetição.
 */
const INTERVALO_MS = 30 * 60 * 1000

/** Espera antes da primeira varredura, para não disputar com a abertura do app. */
const ATRASO_INICIAL_MS = 2 * 60 * 1000

export type ResultadoCiclo = {
  enviados: number
  /** Por que o ciclo não fez nada, quando não fez. Só para registro. */
  motivo?: 'sem-licenca' | 'sem-recurso' | 'sem-pendentes' | 'sem-rede' | 'erro'
}

type Dependencias = {
  /** Onde os zips estão. Injetado para o teste não precisar de pasta de verdade. */
  pastaBackups: string
  urlBackend: string
  /** `fetch` entra por parâmetro pelo mesmo motivo. */
  buscar?: typeof fetch
}

const ARQUIVO_MEMORIA = 'enviados-nuvem.json'

function lerMemoria(pasta: string): string[] {
  try {
    const caminho = join(pasta, ARQUIVO_MEMORIA)
    if (!existsSync(caminho)) return []
    const dados = JSON.parse(readFileSync(caminho, 'utf8')) as unknown
    return Array.isArray(dados) ? dados.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Memória corrompida não pode parar o envio: o pior que acontece é um
    // arquivo subir de novo.
    return []
  }
}

function gravarMemoria(pasta: string, lista: string[]): void {
  try {
    writeFileSync(join(pasta, ARQUIVO_MEMORIA), JSON.stringify(lista), 'utf8')
  } catch {
    // Sem memória, o arquivo sobe de novo no próximo ciclo. Desperdício, não erro.
  }
}

/**
 * Quais subpastas de backup valem a pena mandar para fora.
 *
 * `automaticos` e `por-venda` ficam DE FORA de propósito: são dezenas por dia,
 * feitos de minuto em minuto, e existem para desfazer um erro de digitação
 * agora — não para sobreviver a um disco queimado. Mandá-los encheria a nuvem
 * e a internet da loja com cópias que ninguém vai buscar.
 *
 * `pre-restauracao` também fica: ele existe para desfazer a restauração que
 * acabou de acontecer, naquele computador.
 */
const SUBPASTAS_QUE_SOBEM = ['diarios', 'manuais', 'pre-update']

/**
 * Os zips guardados, com tamanho e data.
 *
 * O nome do arquivo já carrega a data e o tipo
 * (`backup_2026-09-08_10-42-03_diario.zip`), então ele é único entre as
 * subpastas e serve como nome do objeto na nuvem sem prefixo nenhum.
 */
export function listarZips(pastaBase: string): ArquivoLocal[] {
  const achados: ArquivoLocal[] = []
  for (const sub of SUBPASTAS_QUE_SOBEM) {
    try {
      const pasta = join(pastaBase, sub)
      if (!existsSync(pasta)) continue
      for (const nome of readdirSync(pasta)) {
        if (!nome.toLowerCase().endsWith('.zip')) continue
        const caminho = join(pasta, nome)
        const st = statSync(caminho)
        achados.push({ nome, caminho, tamanhoBytes: st.size, quandoMs: st.mtimeMs })
      }
    } catch {
      // Pasta some no meio da varredura, permissão negada: segue para a
      // próxima em vez de derrubar o ciclo inteiro.
    }
  }
  return achados
}

/**
 * Um ciclo inteiro: descobre o que falta, pede autorização e envia.
 *
 * ⚠️ Devolve o resultado, NUNCA lança. Quem chama é um temporizador, e uma
 * exceção não capturada num temporizador do Electron derruba o processo — ou
 * seja, fecharia o sistema da loja por causa de um backup.
 */
export async function executarCicloNuvem(dep: Dependencias): Promise<ResultadoCiclo> {
  try {
    const buscar = dep.buscar ?? fetch
    const chave = chaveLicencaLocal()
    if (!chave) return { enviados: 0, motivo: 'sem-licenca' }

    const fila = pendentes(listarZips(dep.pastaBackups), lerMemoria(dep.pastaBackups))
    if (fila.length === 0) return { enviados: 0, motivo: 'sem-pendentes' }

    let enviados = 0
    for (const arquivo of fila) {
      const resposta = await buscar(`${dep.urlBackend}/backup/enviar-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chave,
          nomeArquivo: arquivo.nome,
          tamanhoBytes: arquivo.tamanhoBytes
        })
      })

      /*
       * ⚠️ 403 é o "esta loja não tem o recurso", e ele encerra o ciclo INTEIRO
       * em vez de pular para o próximo arquivo. Insistir com os outros seria
       * uma ida de rede por zip guardado, toda meia hora, para receber a mesma
       * recusa — e é o estado de TODA loja que não contratou.
       */
      if (resposta.status === 403) return { enviados, motivo: 'sem-recurso' }
      if (!resposta.ok) return { enviados, motivo: 'erro' }

      const { url } = (await resposta.json()) as { url?: string }
      if (!url) return { enviados, motivo: 'erro' }

      const envio = await buscar(url, {
        method: 'PUT',
        body: readFileSync(arquivo.caminho),
        headers: { 'content-type': 'application/zip' }
      })
      if (!envio.ok) return { enviados, motivo: 'erro' }

      gravarMemoria(
        dep.pastaBackups,
        registrarEnviado(lerMemoria(dep.pastaBackups), arquivo.nome)
      )
      enviados++
    }
    return { enviados }
  } catch {
    // Internet caída, DNS fora, servidor mudo: nada disso é motivo para o
    // sistema da loja reclamar. Tenta de novo no próximo ciclo.
    return { enviados: 0, motivo: 'sem-rede' }
  }
}

export type BackupNaNuvem = {
  chave: string
  nome: string
  tamanhoBytes: number
  quando: string
}

/**
 * O que esta loja tem guardado na nuvem.
 *
 * ⚠️ Quem lista é o SERVIDOR, e o prefixo nunca sai de lá: listar exige
 * assinar o bucket com um filtro, e um endereço desses na máquina do cliente
 * seria trocar o filtro e ver o nome dos backups de todas as lojas.
 *
 * Devolve lista vazia em qualquer problema — tela de restauração que quebra
 * porque a internet caiu é pior do que uma seção vazia.
 */
export async function listarNaNuvem(dep: Dependencias): Promise<BackupNaNuvem[]> {
  try {
    const buscar = dep.buscar ?? fetch
    const chave = chaveLicencaLocal()
    if (!chave) return []
    const r = await buscar(`${dep.urlBackend}/backup/listar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chave })
    })
    if (!r.ok) return []
    const dados = (await r.json()) as { itens?: BackupNaNuvem[] }
    return Array.isArray(dados.itens) ? dados.itens : []
  } catch {
    return []
  }
}

/**
 * Traz um backup da nuvem para o disco, na subpasta `da-nuvem`.
 *
 * É a subpasta que o `Restaurador` varre PRIMEIRO — ela já existia para a loja
 * hospedada, e o arquivo baixado aparece no topo da lista de restauração sem
 * nenhuma tela nova. Quem acabou de baixar quer restaurar aquilo, e não
 * procurar o próprio arquivo no meio dos outros.
 *
 * ⚠️ O arquivo NÃO é restaurado aqui. Baixar e restaurar são duas decisões, e
 * a segunda troca o banco da loja inteira — ela continua passando pela tela de
 * restauração, com a senha que ela já pede.
 */
export async function baixarDaNuvem(
  dep: Dependencias,
  chaveObjeto: string
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  try {
    const buscar = dep.buscar ?? fetch
    const chave = chaveLicencaLocal()
    if (!chave) return { ok: false, erro: 'Esta máquina não tem licença ativada.' }

    const r = await buscar(`${dep.urlBackend}/backup/baixar-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chave, chaveObjeto })
    })
    if (!r.ok) return { ok: false, erro: 'Não foi possível pedir este backup ao servidor.' }
    const { url } = (await r.json()) as { url?: string }
    if (!url) return { ok: false, erro: 'Resposta do servidor sem endereço de download.' }

    const arquivo = await buscar(url)
    if (!arquivo.ok) return { ok: false, erro: `O armazenamento respondeu ${arquivo.status}.` }

    const destino = join(dep.pastaBackups, 'da-nuvem')
    mkdirSync(destino, { recursive: true })
    // O nome sai da CHAVE, que veio da listagem do servidor: usar um nome
    // vindo de outro lugar deixaria o arquivo cair fora da pasta.
    const nome = chaveObjeto.split('/').pop() ?? 'backup.zip'
    const caminho = join(destino, nome)
    writeFileSync(caminho, Buffer.from(await arquivo.arrayBuffer()))
    return { ok: true, caminho }
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor.' }
  }
}

let temporizador: NodeJS.Timeout | null = null

/**
 * Liga a varredura periódica.
 *
 * ⚠️ Chamada UMA vez, na abertura, e nunca de dentro de um caminho de venda ou
 * de atualização. O `unref` deixa o processo fechar sem esperar por ela — sem
 * isso, um envio em andamento seguraria o fechamento do app, que é exatamente o
 * tipo de coisa que faz o lojista achar que o sistema travou.
 */
export function agendarEnvioNuvem(dep: Dependencias): void {
  if (temporizador) return
  const rodar = (): void => {
    void executarCicloNuvem(dep)
  }
  const inicial = setTimeout(rodar, ATRASO_INICIAL_MS)
  inicial.unref?.()
  temporizador = setInterval(rodar, INTERVALO_MS)
  temporizador.unref?.()
}

/** Para a varredura. Existe para o teste e para o fechamento ordenado. */
export function pararEnvioNuvem(): void {
  if (temporizador) clearInterval(temporizador)
  temporizador = null
}
