import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Bloco cinza com brilho pulsante que ocupa o lugar de um conteúdo enquanto
 * ele carrega. Sozinho não tem tamanho — dê altura/largura pela className
 * (ex.: <Skeleton className="h-4 w-32" />).
 */
// Tom: `bg-muted` (96% de luz) some no fundo branco dos cards, então usamos
// `muted-foreground` com baixa opacidade — um cinza com contraste de verdade
// que ainda se adapta ao tema escuro (lá o muted-foreground é claro).
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted-foreground/25', className)} {...props} />
}

export { Skeleton }
