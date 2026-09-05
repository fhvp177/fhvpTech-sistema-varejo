// A "fotinha" que identifica uma linha de lista no celular.
//
// ⚠️ A COR sorteada por nome é escolha do dono, tomada olhando a tela pronta:
// o roteiro de mobile chama isso de ruído competindo com o vermelho da dívida, e
// ela já esteve cinza aqui. Ele pediu a cor de volta. Não desfazer citando o
// roteiro — a pergunta já foi feita e respondida.
//
// Mora em utils porque Clientes e Fornecedores mostram a MESMA bolinha, e duas
// cópias das mesmas duas funções divergiriam na primeira cor que alguém trocasse.

// Iniciais: 1ª letra do primeiro nome + 1ª do último (ou as 2 primeiras, se for
// um nome só).
export const iniciaisDoNome = (nome: string): string => {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export const CORES_AVATAR = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'
]

// Cor estável por nome — o mesmo nome cai sempre na mesma cor, em qualquer tela.
export const corDoNome = (nome: string): string => {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (Math.imul(h, 31) + nome.charCodeAt(i)) | 0
  return CORES_AVATAR[Math.abs(h) % CORES_AVATAR.length]
}
