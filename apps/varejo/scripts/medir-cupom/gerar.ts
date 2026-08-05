import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gerarHtmlCupomVenda } from '../../src/utils/cupomVenda'
import { gerarHtmlComprovanteDevolucao } from '../../src/utils/comprovanteDevolucao'
import { LOJA_PADRAO } from '../../src/utils/dadosLoja'

// Sem argumento, escreve na temp do sistema — o `npm run medir:cupom` conta
// com isso pros dois passos caírem na mesma pasta.
const dir = process.argv[2] || join(tmpdir(), 'fhvp-medir-cupom')
mkdirSync(dir, { recursive: true })

// Uma palavra só, sem espaço nenhum, em TODOS os campos de texto. É o pior caso
// possível: sem espaço, o navegador não tem onde quebrar a não ser que a regra
// mande quebrar no meio da palavra.
const M = 'MEGAPALAVRAINTERMINAVELSEMESPACOALGUMPRAQUEBRAR'.repeat(3)

const lojaAbsurda = {
  ...LOJA_PADRAO,
  nome: M, razao_social: M, cnpj: M, endereco: M,
  cidade: M, uf: M, cep: M, telefone: M,
  // Chave real em formato, fictícia em dono. Sem ela o cupom sairia sem o
  // bloco do PIX e a régua não mediria o QR — que é justamente o elemento de
  // largura fixa mais teimoso do cupom: ele não encolhe pra caber.
  pix_chave: '123e4567-e12b-12d1-a456-426655440000'
}

writeFileSync(join(dir, 'cupom-extremo.html'), gerarHtmlCupomVenda({
  id: 999999, data: '2026-08-01T16:06:00',
  total: 1234567890.12, desconto: 999999.99, entrada: 888888.88,
  valor_pago: 0, status_pagamento: 'parcelado',
  data_vencimento: '2026-08-03', num_parcelas: 12,
  cliente_nome: M, cliente_tipo_pessoa: 'juridica', cliente_razao_social: M,
  cliente_cnpj: M, cliente_endereco: M, cliente_telefone: M, vendedor_nome: M,
  itens: [
    { produto_nome: M, quantidade: 0.755, preco_unitario: 1234567.89 },
    { produto_nome: 'NOME CURTO', quantidade: 1, preco_unitario: 10 }
  ],
  parcelas: [
    { numero: 1, valor: 1234567.89, data_vencimento: '2026-09-03', status: 'pendente' },
    { numero: 12, valor: 1234567.89, data_vencimento: '2027-08-03', status: 'inadimplente' }
  ]
}, lojaAbsurda), 'utf-8')

writeFileSync(join(dir, 'cupom-normal.html'), gerarHtmlCupomVenda({
  id: 59, data: '2026-08-01T16:06:00', total: 3860, valor_pago: 0,
  status_pagamento: 'pendente', data_vencimento: '2026-08-03', num_parcelas: null,
  cliente_nome: 'INSTITUTO MARIA IMACULADA', cliente_endereco: 'RUA IRMA FERRAZ',
  itens: [
    { produto_nome: 'CAMERA WI-FI VIPW 1220C', quantidade: 2, preco_unitario: 189.9 },
    { produto_nome: 'RACK VERTICAL SLIM', quantidade: 1, preco_unitario: 1234.56 }
  ],
  parcelas: []
}, { ...LOJA_PADRAO, nome: 'INFORMATICA AVP', telefone: '(85) 99198-3482',
     razao_social: 'INFORMATICA AVP COMERCIO LTDA', cnpj: '00.000.000/0001-00',
     endereco: 'RUA UM, 100', cidade: 'CIDADE', uf: 'CE', cep: '60000-000',
     // Venda a prazo + chave preenchida = o cupom de baixo sai COM o bloco do
     // PIX. É nele que dá pra ver se o QR fica legível, e não só se cabe.
     pix_chave: '123e4567-e12b-12d1-a456-426655440000' }), 'utf-8')

writeFileSync(join(dir, 'devolucao-extremo.html'), gerarHtmlComprovanteDevolucao({
  id: 3, venda_id: 59, data: '2026-08-01T16:06:00', tipo: 'credito',
  valor_total: 1234567890.12, cliente_nome: M, motivo: M,
  saldo_credito_novo: 1234567890.12, vendedor_nome: M,
  itens: [{ produto_nome: M, quantidade: 0.755, valor_unitario: 1234567.89 }]
}, lojaAbsurda), 'utf-8')

console.log('gerados em', dir)
