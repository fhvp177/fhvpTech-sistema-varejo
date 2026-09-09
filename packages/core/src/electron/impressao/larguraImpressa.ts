/*
 * A largura que a cabeça térmica IMPRIME — que não é a largura da bobina.
 *
 * Uma bobina de 80mm não escreve 80mm. A cabeça da POS80 alcança 72mm (576
 * pontos a 203dpi) e essa faixa fica no MEIO do papel: sobram uns 4mm de cada
 * lado onde nada sai, aconteça o que acontecer. O cupom da venda já sabia
 * disso — é por isso que o corpo dele mede 68mm, e não 80 (ver cupomVenda.ts).
 *
 * ── ⚠️ Quem não sabia era a nota fiscal ─────────────────────────────────────
 * O DANFE não é desenhado aqui: vem pronto do provedor fiscal, e a ACBr monta
 * na largura que a gente pedir (de 40 a 80mm, com 2mm de margem). Pedindo 80,
 * o conteúdo ocupa de 2mm a 78mm do papel — quatro milímetros ALÉM do que a
 * cabeça escreve. O que fica de fora não é enfeite: é a coluna da direita
 * inteira (VL TOTAL, o valor a pagar, o valor pago, o troco) e o último dígito
 * da chave de acesso.
 *
 * A cura é pedir o DANFE já na largura que imprime. Quem manda no desenho
 * passa a ser o provedor, que reparte as colunas de novo em 72mm em vez de
 * escrever 76mm de conteúdo e confiar que o papel aguenta.
 *
 * ── ⚠️ As duas medidas têm que ser a MESMA ──────────────────────────────────
 * Esta função responde por dois lugares: a largura pedida à ACBr e o tamanho
 * da página na hora de imprimir. Elas não podem divergir. Uma página maior que
 * o PDF centraliza a nota e empurra um pedaço pra fora outra vez — é
 * exatamente assim que o defeito nasceu (o PDF de 80mm caindo numa folha de
 * 210mm, com meio centímetro de papel escrito). Por isso as duas saem daqui, e
 * não de dois números escritos em arquivos diferentes.
 */
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'

/**
 * Bobina (o papel) → largura impressa (a cabeça), em milímetros.
 *
 * 80mm de papel = 72mm impressos (576 pontos a 203dpi).
 * 58mm de papel = 48mm impressos (384 pontos a 203dpi).
 */
export const LARGURA_IMPRESSA_MM: Record<number, number> = { 80: 72, 58: 48 }

/** Largura impressa de uma bobina. Bobina desconhecida cai na de 80mm. */
export function larguraImpressaMm(bobinaMm: number): number {
  return LARGURA_IMPRESSA_MM[bobinaMm] ?? LARGURA_IMPRESSA_MM[80]
}

/** A bobina configurada na loja. 80mm é o padrão; 58mm é a estreita. */
export function larguraBobinaConfigurada(): 58 | 80 {
  return lerConfig('fiscal_largura_bobina') === '58' ? 58 : 80
}

/**
 * A largura do DANFE desta loja, em milímetros — pedida ao provedor fiscal E
 * usada como tamanho da página na impressão. Uma medida só, para os dois.
 */
export function larguraDoDanfeMm(): number {
  return larguraImpressaMm(larguraBobinaConfigurada())
}
