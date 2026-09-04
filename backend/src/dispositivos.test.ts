// Testes do limite de máquinas por loja.
// node:test + node:assert (nativos), igual ao cotaNotas.test.ts.
// Rodar: npx tsx --test src/dispositivos.test.ts
//
// O que estes testes seguram:
//   • LOJA SEM LIMITE CONTINUA ATIVANDO. É o caso perigoso: `limiteDispositivos`
//     nasce ausente em toda loja que já existe, e ler "ausente" como "zero"
//     impediria qualquer instalação no primeiro deploy. É o 1º teste do arquivo
//     pelo mesmo motivo que o "loja sem cota" é o 1º do cotaNotas.test.ts.
//   • A IDENTIDADE É O PAR (identificador + digital do hardware). Trocar por
//     "só o identificador" tem cara de simplificação e devolve a cópia de pasta
//     ao que era antes, sem quebrar nada visível.
//   • FORMATAR O PC NÃO QUEIMA VAGA, que é o que evita a ligação de suporte.
//   • LIBERAR VAGA FUNCIONA de verdade: a máquina liberada volta a DISPUTAR.
//     Sem isso o computador que você acabou de tirar retoma a vaga sozinho.
//   • A CHAVE É QUEM DIZ QUEM É A LOJA, e a comparação do HMAC é em tempo
//     constante. Os dois últimos são lidos do FONTE: nenhum teste de
//     comportamento fica vermelho se alguém trocar por `===`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  avaliarDispositivos,
  decidirVaga,
  estaAtiva,
  nomeSeguroDeMaquina,
  DIAS_SEM_SINAL_LIBERA,
  HORAS_ENTRE_CONFERENCIAS,
  type Dispositivo,
  type PedidoDeVaga
} from './dispositivos.js'
import { conferirChaveDeLicenca, gerarChaveLicenca, iguaisEmTempoConstante } from './licenca.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FONTE_DISPOSITIVOS = readFileSync(join(AQUI, 'dispositivos.ts'), 'utf8')
const FONTE_LICENCA = readFileSync(join(AQUI, 'licenca.ts'), 'utf8')
const FONTE_INDEX = readFileSync(join(AQUI, 'index.ts'), 'utf8')
const FONTE_PAINEL = readFileSync(join(AQUI, 'painel-fhvp.html'), 'utf8')
const FONTE_UI = readFileSync(join(AQUI, 'painel-ui.js'), 'utf8')

const AGORA = Date.parse('2026-09-03T12:00:00Z')
const DIA = 86_400_000

function maquina(over: Partial<Dispositivo> = {}): Dispositivo {
  return {
    deviceId: 'aaaaaaaa-1111-2222-3333-444444444444',
    digital: 'a1b2c3d4e5f60718',
    nome: 'CAIXA-01',
    origem: 'principal',
    primeiroEm: new Date(AGORA - 40 * DIA).toISOString(),
    ultimoEm: new Date(AGORA - DIA).toISOString(),
    ...over
  }
}

function pedido(over: Partial<PedidoDeVaga> = {}): PedidoDeVaga {
  return {
    deviceId: 'bbbbbbbb-1111-2222-3333-444444444444',
    digital: 'ffffffffffffffff',
    nome: 'CAIXA-02',
    origem: 'principal',
    ...over
  }
}

// ── O caso que não pode quebrar em produção ──────────────────────────────────

test('loja SEM limite definido ativa em quantas máquinas quiser', () => {
  const existentes = [maquina(), maquina({ deviceId: 'x2', digital: 'd2' })]
  for (const limite of [undefined, null]) {
    const v = decidirVaga({ existentes, pedido: pedido(), limite, agoraMs: AGORA })
    assert.equal(v.concedida, true)
    assert.equal(v.concedida && v.motivo, 'nova')
  }
})

test('limite ausente na situação do painel nunca vira "acima do limite"', () => {
  const s = avaliarDispositivos([maquina(), maquina({ deviceId: 'x2' })], undefined, AGORA)
  assert.equal(s.limite, null)
  assert.equal(s.emUso, 2)
  assert.equal(s.livres, null)
  assert.equal(s.acimaDoLimite, false)
})

// ── O limite, quando existe ──────────────────────────────────────────────────

test('máquina nova entra enquanto há vaga', () => {
  const v = decidirVaga({ existentes: [maquina()], pedido: pedido(), limite: 2, agoraMs: AGORA })
  assert.equal(v.concedida, true)
  assert.equal(v.concedida && v.emUso, 2)
})

test('máquina nova é RECUSADA quando o limite está cheio', () => {
  const existentes = [maquina(), maquina({ deviceId: 'x2', digital: 'd2', nome: 'ESCRITORIO' })]
  const v = decidirVaga({ existentes, pedido: pedido(), limite: 2, agoraMs: AGORA })
  assert.equal(v.concedida, false)
  assert.equal(!v.concedida && v.limite, 2)
})

test('a recusa NOMEIA as máquinas em uso, senão não dá para saber qual liberar', () => {
  const existentes = [maquina({ nome: 'CAIXA-01' }), maquina({ deviceId: 'x2', digital: 'd2', nome: 'ESCRITORIO' })]
  const v = decidirVaga({ existentes, pedido: pedido(), limite: 2, agoraMs: AGORA })
  assert.equal(v.concedida, false)
  if (v.concedida) return
  assert.match(v.mensagem, /CAIXA-01/)
  assert.match(v.mensagem, /ESCRITORIO/)
  assert.match(v.mensagem, /2 máquinas/)
})

test('limite 1 fala no singular', () => {
  const v = decidirVaga({ existentes: [maquina()], pedido: pedido(), limite: 1, agoraMs: AGORA })
  assert.equal(v.concedida, false)
  assert.equal(!v.concedida && /1 máquina\b/.test(v.mensagem), true)
})

test('a mesma máquina renova mesmo com o limite cheio', () => {
  const ja = maquina()
  const existentes = [ja, maquina({ deviceId: 'x2', digital: 'd2' })]
  const v = decidirVaga({
    existentes,
    pedido: pedido({ deviceId: ja.deviceId, digital: ja.digital }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  assert.equal(v.concedida && v.motivo, 'ja-tinha')
  assert.equal(v.concedida && v.emUso, 2, 'renovar não pode inventar uma vaga a mais')
})

test('renovar preserva a data de entrada e atualiza a do último sinal', () => {
  const ja = maquina()
  const v = decidirVaga({
    existentes: [ja],
    pedido: pedido({ deviceId: ja.deviceId, digital: ja.digital, nome: 'CAIXA PRINCIPAL' }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  if (!v.concedida) return
  assert.equal(v.registro.primeiroEm, ja.primeiroEm)
  assert.equal(v.registro.ultimoEm, new Date(AGORA).toISOString())
  assert.equal(v.registro.nome, 'CAIXA PRINCIPAL', 'o nome do computador pode mudar')
})

// ── A identidade é o PAR ─────────────────────────────────────────────────────

test('★ pasta de dados COPIADA para outro PC gasta a segunda vaga', () => {
  // Mesmo identificador sorteado (veio junto na cópia), hardware diferente.
  const original = maquina()
  const v = decidirVaga({
    existentes: [original],
    pedido: pedido({ deviceId: original.deviceId, digital: 'outrohardware11' }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  assert.equal(v.concedida && v.motivo, 'nova', 'é outra máquina, não uma renovação')
  assert.equal(v.concedida && v.emUso, 2)
})

test('★ pasta COPIADA é recusada quando o limite já está cheio', () => {
  const original = maquina()
  const existentes = [original, maquina({ deviceId: 'x2', digital: 'd2' })]
  const v = decidirVaga({
    existentes,
    pedido: pedido({ deviceId: original.deviceId, digital: 'outrohardware11' }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, false, 'sem isto, copiar a pasta burla o limite inteiro')
})

test('★ formatar o PC NÃO queima vaga: mesmo hardware, identificador novo', () => {
  const antiga = maquina()
  const existentes = [antiga, maquina({ deviceId: 'x2', digital: 'd2' })]
  const v = decidirVaga({
    existentes,
    pedido: pedido({ deviceId: 'novo-id-depois-do-format', digital: antiga.digital }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  if (!v.concedida) return
  assert.equal(v.motivo, 'reconhecida')
  assert.equal(v.substitui, antiga.deviceId, 'o registro antigo tem que sair, senão sobra órfão')
  assert.equal(v.registro.primeiroEm, antiga.primeiroEm)
  assert.equal(v.emUso, 2)
})

test('máquina SEM digital cai na identidade pelo identificador', () => {
  const semDigital = maquina({ digital: '' })
  const v = decidirVaga({
    existentes: [semDigital],
    pedido: pedido({ deviceId: semDigital.deviceId, digital: '' }),
    limite: 1,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  assert.equal(v.concedida && v.motivo, 'ja-tinha')
})

test('duas máquinas SEM digital não herdam a vaga uma da outra', () => {
  const semDigital = maquina({ digital: '' })
  const v = decidirVaga({
    existentes: [semDigital],
    pedido: pedido({ deviceId: 'outro-pc-sem-digital', digital: '' }),
    limite: 1,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, false, 'digital vazia não pode casar com digital vazia')
})

// ── A vaga que volta sozinha ─────────────────────────────────────────────────

test(`máquina calada há mais de ${DIAS_SEM_SINAL_LIBERA} dias devolve a vaga`, () => {
  const sumida = maquina({ ultimoEm: new Date(AGORA - (DIAS_SEM_SINAL_LIBERA + 1) * DIA).toISOString() })
  assert.equal(estaAtiva(sumida, AGORA), false)

  const v = decidirVaga({ existentes: [sumida], pedido: pedido(), limite: 1, agoraMs: AGORA })
  assert.equal(v.concedida, true)
})

test('máquina no último dia da janela AINDA segura a vaga', () => {
  const quaseSumida = maquina({
    ultimoEm: new Date(AGORA - (DIAS_SEM_SINAL_LIBERA * DIA - 1000)).toISOString()
  })
  assert.equal(estaAtiva(quaseSumida, AGORA), true)
  const v = decidirVaga({ existentes: [quaseSumida], pedido: pedido(), limite: 1, agoraMs: AGORA })
  assert.equal(v.concedida, false)
})

test('data de último sinal ilegível não segura vaga', () => {
  assert.equal(estaAtiva({ ultimoEm: 'ontem' }, AGORA), false)
})

// ── Liberar vaga no painel ───────────────────────────────────────────────────

test('máquina liberada não segura vaga', () => {
  const liberada = maquina({ liberadoEm: new Date(AGORA - 1000).toISOString() })
  assert.equal(estaAtiva(liberada, AGORA), false)
  const s = avaliarDispositivos([liberada], 1, AGORA)
  assert.equal(s.emUso, 0)
  assert.equal(s.liberadas, 1)
  assert.equal(s.dormentes, 0, 'liberada e dormente são coisas diferentes')
})

test('★ máquina liberada volta a DISPUTAR a vaga, não a retoma sozinha', () => {
  const liberada = maquina({ liberadoEm: new Date(AGORA - 1000).toISOString() })
  const nova = maquina({ deviceId: 'pc-novo', digital: 'digitaldopcnovo1' })
  const v = decidirVaga({
    existentes: [liberada, nova],
    pedido: pedido({ deviceId: liberada.deviceId, digital: liberada.digital }),
    limite: 1,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, false, 'senão liberar vira enfeite: o PC tirado volta na conferência')
})

test('máquina liberada entra de novo quando há espaço, mantendo a história', () => {
  const liberada = maquina({ liberadoEm: new Date(AGORA - 1000).toISOString() })
  const v = decidirVaga({
    existentes: [liberada],
    pedido: pedido({ deviceId: liberada.deviceId, digital: liberada.digital }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  if (!v.concedida) return
  assert.equal(v.registro.primeiroEm, liberada.primeiroEm)
  assert.equal(v.registro.liberadoEm, undefined, 'voltou a valer, a marca tem que sair')
})

// ── A liberação por loja ─────────────────────────────────────────────────────

test('permitir acima do limite deixa passar e DIZ que passou', () => {
  const existentes = [maquina(), maquina({ deviceId: 'x2', digital: 'd2' })]
  const v = decidirVaga({
    existentes,
    pedido: pedido(),
    limite: 2,
    permitirAcimaDoLimite: true,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, true)
  assert.equal(v.concedida && v.motivo, 'acima-do-limite-liberado')
})

test('permitir acima do limite é preciso ser LIGADO, não é o padrão', () => {
  const existentes = [maquina(), maquina({ deviceId: 'x2', digital: 'd2' })]
  for (const permitir of [undefined, false]) {
    const v = decidirVaga({
      existentes,
      pedido: pedido(),
      limite: 2,
      permitirAcimaDoLimite: permitir,
      agoraMs: AGORA
    })
    assert.equal(v.concedida, false)
  }
})

test('o painel enxerga a loja que está acima do limite', () => {
  const existentes = [maquina(), maquina({ deviceId: 'x2', digital: 'd2' }), maquina({ deviceId: 'x3', digital: 'd3' })]
  const s = avaliarDispositivos(existentes, 2, AGORA)
  assert.equal(s.emUso, 3)
  assert.equal(s.livres, 0)
  assert.equal(s.acimaDoLimite, true)
})

// ── O terminal do multicaixa conta ───────────────────────────────────────────

test('segundo caixa (terminal) precisa de vaga como qualquer máquina', () => {
  const v = decidirVaga({
    existentes: [maquina()],
    pedido: pedido({ origem: 'terminal' }),
    limite: 1,
    agoraMs: AGORA
  })
  assert.equal(v.concedida, false, 'decidido em 2026-09-03: o 2º caixa é uma máquina a mais')
})

test('★ um terminal já instalado SEGURA a vaga contra uma máquina nova', () => {
  // O outro lado da mesma decisão, e o que a mutação pegou: não basta o
  // terminal PEDIR vaga, ele tem que OCUPAR uma depois de instalado.
  const terminal = maquina({ origem: 'terminal', nome: 'NOTEBOOK-BALCAO' })
  const v = decidirVaga({ existentes: [terminal], pedido: pedido(), limite: 1, agoraMs: AGORA })
  assert.equal(v.concedida, false)
})

test('terminal aparece na contagem do painel', () => {
  const s = avaliarDispositivos([maquina({ origem: 'terminal' })], 1, AGORA)
  assert.equal(s.emUso, 1)
  assert.equal(s.livres, 0)
})

test('a origem fica gravada, para o painel dizer o que é cada linha', () => {
  const v = decidirVaga({
    existentes: [],
    pedido: pedido({ origem: 'terminal' }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida && v.registro.origem, 'terminal')
})

// ── Nome da máquina: vem de fora ──────────────────────────────────────────

test('nome da máquina é limpo antes de virar linha no painel', () => {
  assert.equal(nomeSeguroDeMaquina('CAIXA-01'), 'CAIXA-01')
  assert.equal(nomeSeguroDeMaquina('  CAIXA-01  '), 'CAIXA-01')
  assert.equal(nomeSeguroDeMaquina(''), 'Máquina sem nome')
  assert.equal(nomeSeguroDeMaquina(undefined), 'Máquina sem nome')
  assert.equal(nomeSeguroDeMaquina(12345), 'Máquina sem nome')
  assert.equal(nomeSeguroDeMaquina('x'.repeat(200)).length, 60)
})

test('caractere de controle no nome não passa', () => {
  const comControle = 'CAIXA' + String.fromCharCode(0) + String.fromCharCode(27) + '01'
  const limpo = nomeSeguroDeMaquina(comControle)
  const temControle = Array.from(limpo).some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  assert.equal(temControle, false)
  assert.match(limpo, /CAIXA/)
})

test('o pedido passa pela limpeza, não só a rota', () => {
  const v = decidirVaga({
    existentes: [],
    pedido: pedido({ nome: '   ' }),
    limite: 2,
    agoraMs: AGORA
  })
  assert.equal(v.concedida && v.registro.nome, 'Máquina sem nome')
})

// ── A chave é quem diz de que loja é a máquina ───────────────────────────────

const SEGREDO = 'segredo-de-teste-nao-e-o-de-producao'

test('chave legítima identifica a loja', async () => {
  const chave = await gerarChaveLicenca(SEGREDO, 'NETO', '2026-10-03')
  const r = await conferirChaveDeLicenca(SEGREDO, chave)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.clienteId, 'NETO')
  assert.equal(r.ok && r.expiracao, '2026-10-03')
})

test('chave de cliente de revendedor (com hífen) é aceita', async () => {
  const chave = await gerarChaveLicenca(SEGREDO, 'REV1-LOJA2', '2026-10-03')
  const r = await conferirChaveDeLicenca(SEGREDO, chave)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.clienteId, 'REV1-LOJA2')
})

test('★ HMAC adulterado é recusado', async () => {
  const chave = await gerarChaveLicenca(SEGREDO, 'NETO', '2026-10-03')
  const [id, exp, hmac] = chave.split(':')
  const trocado = hmac[0] === 'A' ? 'B' : 'A'
  const r = await conferirChaveDeLicenca(SEGREDO, `${id}:${exp}:${trocado}${hmac.slice(1)}`)
  assert.equal(r.ok, false)
})

test('chave assinada com OUTRO segredo é recusada', async () => {
  const chave = await gerarChaveLicenca('outro-segredo', 'NETO', '2026-10-03')
  const r = await conferirChaveDeLicenca(SEGREDO, chave)
  assert.equal(r.ok, false)
})

test('chave em formato inválido não chega a ser comparada', async () => {
  for (const ruim of ['', 'NETO', 'NETO:2026-10-03', 'a:b:c:d', 42, null, undefined]) {
    const r = await conferirChaveDeLicenca(SEGREDO, ruim)
    assert.equal(r.ok, false, `deveria recusar: ${String(ruim)}`)
  }
})

test('clienteId fora do formato é recusado antes do HMAC', async () => {
  for (const id of ['A', 'loja com espaço', 'LOJA/../OUTRA', 'A-B-C']) {
    const r = await conferirChaveDeLicenca(SEGREDO, `${id}:2026-10-03:AAAAAAAAAAAAAAAA`)
    assert.equal(r.ok, false, `deveria recusar: ${id}`)
  }
})

test('comparação em tempo constante responde certo nos dois sentidos', () => {
  assert.equal(iguaisEmTempoConstante('ABC', 'ABC'), true)
  assert.equal(iguaisEmTempoConstante('ABC', 'ABD'), false)
  assert.equal(iguaisEmTempoConstante('ABC', 'ABCD'), false)
  assert.equal(iguaisEmTempoConstante('', ''), true)
})

// ── Guardas lidas do FONTE ───────────────────────────────────────────────────
//
// Nenhum teste de comportamento fica vermelho se alguém trocar a comparação por
// `===` ou passar a confiar no clienteId do corpo do pedido. Por isso estes.

test('★ a conferência da chave usa comparação em tempo constante', () => {
  const corpo = FONTE_LICENCA.slice(FONTE_LICENCA.indexOf('export async function conferirChaveDeLicenca'))
  assert.match(
    corpo,
    /iguaisEmTempoConstante\(/,
    'trocar por === abre oráculo de tempo sobre o HMAC'
  )
})

test('★ a rota de vaga tira o clienteId DA CHAVE, nunca do corpo', () => {
  const rota = FONTE_INDEX.slice(
    FONTE_INDEX.indexOf("app.post('/licenca/dispositivo'"),
    FONTE_INDEX.indexOf("// Painel do revendedor")
  )
  assert.ok(rota.length > 200, 'a rota de vaga sumiu do index.ts')
  assert.match(rota, /conferirChaveDeLicenca\(config\.CHAVE_HMAC/)
  assert.match(rota, /obterCliente\(conferida\.clienteId\)/)
  assert.equal(
    /obterCliente\(\s*body\.clienteId/.test(rota),
    false,
    'aceitar clienteId do corpo deixaria qualquer um lotar a vaga da loja dos outros'
  )
})

test('★ a identidade da máquina compara os DOIS números', () => {
  const corpo = FONTE_DISPOSITIVOS.slice(FONTE_DISPOSITIVOS.indexOf('export function decidirVaga'))
  assert.match(corpo, /d\.deviceId === pedido\.deviceId/)
  assert.match(
    corpo,
    /d\.digital === pedido\.digital/,
    'sem comparar a digital, copiar a pasta de dados burla o limite'
  )
})

test('a rota de vaga é PÚBLICA de propósito, e continua fora de /admin', () => {
  assert.match(FONTE_INDEX, /app\.post\('\/licenca\/dispositivo'/)
  assert.equal(
    FONTE_INDEX.includes("app.post('/admin/licenca/dispositivo'"),
    false,
    'a loja não tem sessão de painel: mover para /admin quebraria toda ativação'
  )
})

test('a loja recusada recebe nome e data, nunca a digital do hardware', () => {
  const rota = FONTE_INDEX.slice(
    FONTE_INDEX.indexOf("app.post('/licenca/dispositivo'"),
    FONTE_INDEX.indexOf("// Painel do revendedor")
  )
  const recusa = rota.slice(rota.indexOf('concedida: false'))
  assert.match(recusa, /nome: d\.nome/)
  assert.equal(/digital/.test(recusa), false)
})

test('o prazo de reconferência sai da constante compartilhada', () => {
  assert.match(FONTE_INDEX, /HORAS_ENTRE_CONFERENCIAS \* 3_600_000/)
  assert.equal(HORAS_ENTRE_CONFERENCIAS > 0, true)
})

// ── O painel ─────────────────────────────────────────────────────────────────
//
// O painel é página solta, sem build e sem imports: estes testes leem o fonte,
// que é a mesma técnica de `painelVisual.test.ts` e `precoPainel.test.ts`.

test('★ o campo de máquinas tem MÁSCARA, como todo campo com formato', () => {
  // Regra da casa, cobrada mais de uma vez: deixar digitar letra onde só cabe
  // número empurra o erro para o servidor e devolve mensagem genérica longe do
  // campo culpado.
  const campo = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf("{ id: 'dispositivos', rotulo: 'Máquinas incluídas'"),
    FONTE_PAINEL.indexOf("{ id: 'dias', rotulo: 'Dias de licença'")
  )
  assert.ok(campo.length > 50, 'sumiu o campo de máquinas do cadastro')
  assert.match(campo, /formato: 'inteiro'/)
})

test('★ o limite vai na MESMA chamada do cadastro', () => {
  // A cota de notas vai numa segunda chamada, e por isso o código dela precisa
  // avisar "a loja foi criada, mas...". O limite de máquinas é propriedade da
  // licença: mandá-lo depois abriria a janela em que a loja existe sem o limite
  // que foi combinado.
  const cadastro = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('async function modalNovaLoja'),
    FONTE_PAINEL.indexOf('async function mostrarChave')
  )
  const envio = cadastro.indexOf("corpo.limiteDispositivos = n")
  const chamada = cadastro.indexOf("await api('/admin/cliente', { metodo: 'POST', corpo })")
  assert.ok(envio > -1, 'o limite não é enviado no cadastro')
  assert.ok(chamada > envio, 'o limite é montado depois de a loja já ter sido criada')
})

test('vazio no cadastro é SEM LIMITE, e nunca zero', () => {
  const cadastro = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('async function modalNovaLoja'),
    FONTE_PAINEL.indexOf('async function mostrarChave')
  )
  assert.match(cadastro, /if \(maquinasBruto !== ''\) \{/)
  assert.match(cadastro, /n < 1/, 'zero máquinas travaria a loja inteira por um erro de digitação')
})

test('a loja tem como ser ajustada depois, pelo menu da linha', () => {
  assert.match(FONTE_PAINEL, /texto: 'Máquinas', icone: 'monitor'/)
  assert.match(FONTE_PAINEL, /async function modalDispositivos/)
})

test('★ a lista de máquinas mostra o que decide QUAL liberar', () => {
  const modal = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('async function modalDispositivos'),
    FONTE_PAINEL.indexOf('async function modalBloqueioCliente')
  )
  assert.match(modal, /nome\.textContent = d\.nome/, 'sem o nome, liberar vira sorteio')
  assert.match(modal, /último acesso/)
  assert.match(modal, /'Liberar vaga'/)
})

test('o nome da máquina entra por textContent, nunca por innerHTML', () => {
  // O nome vem da máquina do cliente. É conteúdo de fora, e esta é a tela que
  // abre todas as lojas.
  const modal = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('async function modalDispositivos'),
    FONTE_PAINEL.indexOf('async function modalBloqueioCliente')
  )
  assert.equal(/innerHTML/.test(modal), false)
})

test('as duas origens têm ícone próprio, e os ícones existem', () => {
  const modal = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('async function modalDispositivos'),
    FONTE_PAINEL.indexOf('async function modalBloqueioCliente')
  )
  assert.match(modal, /d\.origem === 'terminal' \? 'laptop' : 'monitor'/)
  // Ícone com nome errado não quebra nada: `icone()` devolve um comentário e a
  // linha aparece sem símbolo, em silêncio.
  for (const nome of ['laptop', 'monitor', 'circle-minus']) {
    assert.ok(FONTE_UI.includes(`'${nome}':`), `falta o ícone ${nome} em painel-ui.js`)
  }
})

test('a tabela de lojas não perdeu a conta das colunas', () => {
  // O `colSpan` da linha "nenhuma loja cadastrada" tem que acompanhar o
  // cabeçalho, senão a mensagem para no meio da largura.
  const tabela = FONTE_PAINEL.slice(FONTE_PAINEL.indexOf('<th>Loja</th>'))
  const cabecalho = tabela.slice(0, tabela.indexOf('</tr>'))
  const colunas = (cabecalho.match(/<th/g) || []).length
  assert.equal(colunas, 10)
  assert.match(FONTE_PAINEL, new RegExp('td\\.colSpan = ' + colunas + '; td\\.className'))
})

test('loja sem limite combinado não aparece como irregular', () => {
  // Mostrar "3 / 0" numa loja que nunca negociou limite diria que ela está
  // fora do combinado, e ela não está.
  const celula = FONTE_PAINEL.slice(
    FONTE_PAINEL.indexOf('const maquinas = cl.dispositivos'),
    FONTE_PAINEL.indexOf('A situacao da loja, em UMA etiqueta')
  )
  assert.match(celula, /maquinas\.limite === null/)
  assert.match(celula, /'—'/)
})

test('a etiqueta de situação enxerga a loja acima do limite', () => {
  assert.match(FONTE_PAINEL, /Máquinas acima do plano/)
})

test('o diálogo aceita conteúdo solto, e continua sendo um só', () => {
  assert.match(FONTE_PAINEL, /for \(const bloco of \(o\.blocos \|\| \[\]\)\) caixa\.appendChild\(bloco\)/)
  // Regra da casa: nenhuma caixa nativa do navegador.
  for (const proibida of ['alert(', 'confirm(', 'prompt(']) {
    assert.equal(
      FONTE_PAINEL.includes('window.' + proibida) || new RegExp('[^.\\w]' + proibida.replace('(', '\\(')).test(FONTE_PAINEL),
      false,
      `caixa nativa do navegador no painel: ${proibida}`
    )
  }
})

test('o prazo da vaga parada é o mesmo nos dois lados', () => {
  const naTela = FONTE_PAINEL.match(/const DIAS_SEM_SINAL = (\d+)/)
  assert.ok(naTela, 'o painel deixou de dizer em quantos dias a vaga volta')
  assert.equal(Number(naTela[1]), DIAS_SEM_SINAL_LIBERA)
})

