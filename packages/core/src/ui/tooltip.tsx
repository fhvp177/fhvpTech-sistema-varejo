import * as React from 'react'
import { cn } from '../lib/utils'

type Side = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** Conteúdo exibido na caixinha (texto ou JSX). */
  content: React.ReactNode
  /** Elemento que dispara o tooltip ao passar o mouse / focar. */
  children: React.ReactNode
  /** Lado em que a caixinha aparece. Padrão: 'top'. */
  side?: Side
  /** Classes extras para a caixinha do tooltip. */
  className?: string
}

const sideClasses: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2'
}

/**
 * Tooltip leve, só com CSS (sem dependência externa): a caixinha aparece na
 * hora ao passar o mouse ou focar o elemento — sem o atraso do `title` nativo.
 * Visual escuro clássico, segue o tema (foreground/background).
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-[16rem] rounded-md bg-foreground px-2.5 py-1.5 text-xs font-normal normal-case leading-snug text-background shadow-md',
          'origin-center scale-95 opacity-0 invisible transition-all duration-150 ease-out',
          'group-hover:scale-100 group-hover:opacity-100 group-hover:visible',
          'group-focus-within:scale-100 group-focus-within:opacity-100 group-focus-within:visible',
          sideClasses[side],
          className
        )}
      >
        {content}
      </span>
    </span>
  )
}

export default Tooltip
