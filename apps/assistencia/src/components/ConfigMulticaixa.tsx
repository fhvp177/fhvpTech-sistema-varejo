import { FC, useCallback, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Loader2, MonitorSmartphone, ShieldAlert, Trash2, Wifi, WifiOff } from 'lucide-react'
import type { EstadoMulticaixa } from '@/types/multicaixa'

/**
 * Configuração do multicaixa, no computador principal.
 *
 * A tela é escrita para alguém que não sabe o que é porta, IP ou firewall.
 * Cada informação técnica aparece só quando é preciso digitá-la no outro
 * computador — e aí vem com a instrução do lado.
 */

const fmtData = (iso: string | null): string => {
  if (!iso) return 'ainda não usou'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

/** Quanto falta para o código expirar, em "m:ss". */
function restante(expiraEm: number, agora: number): string {
  const seg = Math.max(0, Math.ceil((expiraEm - agora) / 1000))
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

const ConfigMulticaixa: FC = () => {
  const [estado, setEstado] = useState<EstadoMulticaixa | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())

  const carregar = useCallback(async () => {
    const r = await window.api.multicaixa.estado()
    if (r.success) setEstado(r.data)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Relógio de 1s só enquanto há algum código na tela — é o que faz a contagem
  // regressiva andar. Sem código ativo, nada fica rodando à toa.
  const temCodigo = Boolean(estado?.codigoPareamento || estado?.codigoCopia)
  useEffect(() => {
    if (!temCodigo) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [temCodigo])

  // Código expirado some sozinho, sem o lojista precisar atualizar a tela.
  useEffect(() => {
    const vencido = (c: { expiraEm: number } | null | undefined): boolean =>
      Boolean(c && agora >= c.expiraEm)
    if (vencido(estado?.codigoPareamento) || vencido(estado?.codigoCopia)) void carregar()
  }, [agora, estado?.codigoPareamento, estado?.codigoCopia, carregar])

  async function acao(fn: () => Promise<{ success: boolean; data?: unknown; error?: string }>) {
    setOcupado(true)
    setErro(null)
    const r = await fn()
    if (!r.success) setErro(r.error ?? 'Não foi possível concluir.')
    await carregar()
    setOcupado(false)
  }

  if (!estado) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </p>
    )
  }

  const ligado = estado.modo === 'servidor'
  const codigo = estado.codigoPareamento
  const copia = estado.codigoCopia

  return (
    <div className="space-y-4">
      {erro && (
        <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md p-3">{erro}</p>
      )}

      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm flex items-center gap-1.5">
              {ligado ? (
                <Wifi className="w-4 h-4 text-green-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
              {ligado ? 'Atendendo outros caixas' : 'Este computador atende só a si mesmo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Ao ligar, outro computador com o sistema instalado passa a trabalhar nos mesmos
              dados desta loja — mesmos produtos, mesmo estoque, mesmas vendas. Funciona na rede
              da loja e também fora dela, pela internet. Este computador precisa ficar ligado
              enquanto o outro estiver em uso.
            </p>
            {ligado && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {estado.atendeForaDaLoja
                  ? 'Atendendo também caixas fora da loja.'
                  : 'Atendendo apenas na rede local — a licença deste computador não pôde ser lida.'}
              </p>
            )}
          </div>
          <Button
            variant={ligado ? 'outline' : 'default'}
            size="sm"
            className="shrink-0"
            disabled={ocupado}
            onClick={() =>
              acao(ligado ? window.api.multicaixa.desligarServidor : window.api.multicaixa.ligarServidor)
            }
          >
            {ocupado && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {ligado ? 'Desligar' : 'Ligar'}
          </Button>
        </div>

        {ligado && !estado.servidorNoAr && (
          <p className="text-sm text-amber-700 border-t pt-3">
            O modo está ligado, mas o sistema não conseguiu atender na rede. Normalmente é outro
            programa ocupando a mesma porta. Desligue e ligue novamente; se persistir, reinicie o
            computador.
          </p>
        )}

        {ligado && estado.firewall === 'bloqueado' && (
          <div className="border-t pt-3 flex items-start justify-between gap-4">
            <p className="text-sm text-amber-700 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                O Windows está bloqueando o acesso pela rede, então os outros caixas não vão
                conseguir conectar. Liberar exige a autorização de administrador do computador.
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={ocupado}
              onClick={() => acao(window.api.multicaixa.liberarFirewall)}
            >
              Liberar
            </Button>
          </div>
        )}
      </div>

      {ligado && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-sm">Conectar um caixa novo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No outro computador, escolha conectar-se a um caixa principal e informe o endereço
                e o código abaixo.
              </p>
            </div>
            {!codigo && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={ocupado}
                onClick={() => acao(window.api.multicaixa.abrirPareamento)}
              >
                Gerar código de conexão
              </Button>
            )}
          </div>

          {codigo && (
            <div className="border-t pt-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Endereço deste computador</p>
                <p className="font-mono text-lg font-semibold">
                  {estado.endereco ?? 'rede indisponível'}
                  <span className="text-muted-foreground">:{estado.porta}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Código de conexão</p>
                <p className="font-mono text-3xl font-bold tracking-[0.3em]">{codigo.codigo}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expira em {restante(codigo.expiraEm, agora)} e serve uma vez só. No outro
                  computador, use "Configurar este computador" na tela de entrada.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={ocupado}
                onClick={() => acao(window.api.multicaixa.fecharPareamento)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Fora do bloco `ligado` de propósito: copiar os dados para outro
          computador não exige ter o multicaixa ativado. Quem só está trocando de
          máquina não deveria precisar habilitar caixa adicional nenhum. */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Enviar os dados para outro computador</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Copia produtos, clientes, vendas e configurações desta loja para outro computador.
              Serve para instalar numa máquina nova ou trocar o computador da loja — não é
              necessário para conectar um caixa adicional.
            </p>
          </div>
          {!copia && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={ocupado}
              onClick={() => acao(window.api.multicaixa.abrirClonagem)}
            >
              Gerar código de cópia
            </Button>
          )}
        </div>

        {copia && (
          <div className="border-t pt-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Endereço deste computador</p>
              <p className="font-mono text-lg font-semibold">
                {estado.endereco ?? 'rede indisponível'}
                <span className="text-muted-foreground">:{estado.porta}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Código de cópia</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em]">{copia.codigo}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Expira em {restante(copia.expiraEm, agora)} e serve uma vez só. No outro
                computador, use "Configurar este computador" na tela de entrada.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() => acao(window.api.multicaixa.fecharClonagem)}
            >
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {ligado && (
        <div className="border rounded-lg p-4 bg-muted/30">
          <p className="font-medium text-sm mb-2">Caixas conectados</p>
          {estado.terminais.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum ainda. Gere um código acima para conectar o primeiro.
            </p>
          ) : (
            <ul className="divide-y">
              {estado.terminais.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5 truncate">
                      <MonitorSmartphone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      {t.nome}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Última vez: {fmtData(t.ultimoAcessoEm)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-red-600 hover:text-red-700"
                    disabled={ocupado}
                    onClick={() => acao(() => window.api.multicaixa.revogarTerminal(t.id))}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default ConfigMulticaixa
