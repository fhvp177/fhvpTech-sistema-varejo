// A assistência conversa pelo WhatsApp — estes helpers montam o link wa.me com
// a mensagem certa pro momento da OS. O renderer só faz window.open(url): o
// main já redireciona qualquer janela nova pro navegador padrão
// (setWindowOpenHandler → shell.openExternal).

type OSParaMensagem = {
  id: number
  status: string
  tipo_atendimento?: string
  natureza?: string
  categoria?: string
  cliente_nome?: string
  equipamento: string | null
  agendado_para: string | null
  total?: number
}

const fmtValor = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string): string => {
  const d = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const hora = iso.length >= 16 ? iso.slice(11, 16) : ''
  return hora ? `dia ${d} às ${hora}` : `dia ${d}`
}

const primeiroNome = (nome?: string): string => (nome ?? '').trim().split(/\s+/)[0] ?? ''

// null quando o telefone não dá pra usar (curto demais / vazio).
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  // DDD + número → prefixa o 55 do Brasil; se já veio com código do país, respeita.
  const completo = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${completo}?text=${encodeURIComponent(mensagem)}`
}

export function mensagemWhatsAppOS(os: OSParaMensagem): string {
  const num = String(os.id).padStart(3, '0')
  const nome = primeiroNome(os.cliente_nome)
  const ola = nome ? `Olá, ${nome}! ` : 'Olá! '
  const ehInstalacao = os.natureza === 'instalacao'
  const ehCftv = os.categoria === 'cftv'
  const doQue = ehCftv
    ? ehInstalacao
      ? 'da instalação das câmeras'
      : 'da manutenção do sistema de câmeras'
    : os.equipamento
      ? `de ${os.equipamento}`
      : ehInstalacao
        ? 'da instalação'
        : 'do serviço'

  switch (os.status) {
    case 'aguardando_aprovacao': {
      const valor = os.total && os.total > 0 ? ` Valor: ${fmtValor(os.total)}.` : ''
      return `${ola}O orçamento ${doQue} (OS ${num}) ficou pronto.${valor} Podemos seguir com o serviço?`
    }
    case 'pronta':
      if (os.tipo_atendimento === 'externo') {
        const oQue = ehCftv
          ? ehInstalacao ? 'a instalação das câmeras' : 'a manutenção do sistema de câmeras'
          : ehInstalacao ? 'a instalação' : 'o serviço'
        return `${ola}Boa notícia: concluímos ${oQue} (OS ${num})! Podemos combinar o acerto?`
      }
      return os.equipamento
        ? `${ola}Boa notícia: ${os.equipamento} está pronto! (OS ${num}). Pode retirar quando quiser.`
        : `${ola}Boa notícia: seu serviço (OS ${num}) está pronto!`
    case 'agendada': {
      const quando = os.agendado_para ? ` ${fmtDataHora(os.agendado_para)}` : ''
      return `${ola}Confirmando nossa visita${quando} (OS ${num}). Qualquer imprevisto, é só avisar!`
    }
    default:
      return `${ola}Sobre a OS ${num}: `
  }
}

// Abre a conversa no WhatsApp; retorna false se o telefone não serve.
export function abrirWhatsAppOS(
  telefone: string | null | undefined,
  os: OSParaMensagem
): boolean {
  const url = linkWhatsApp(telefone, mensagemWhatsAppOS(os))
  if (!url) return false
  window.open(url)
  return true
}
