/** @type {import('tailwindcss').Config} */
module.exports = {
  /*
   * ⚠️ Roteiro do mobile, §3.6: sem isto o Tailwind gera `:hover` puro, o
   * celular entra no estado de hover ao tocar e FICA PRESO nele depois que
   * o dedo sai — o item continua destacado como se o ponteiro estivesse em
   * cima. Com a flag, todo `hover:` nasce dentro de `@media (hover: hover)`.
   *
   * Em quem tem mouse nada muda, então o desktop não é afetado.
   */
  future: { hoverOnlyWhenSupported: true },
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // O UI kit (shadcn) vive em @fhvptech/core — sem isso o Tailwind purga as
    // classes usadas só lá e o estilo quebra.
    '../../packages/core/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        /*
         * Tokens semânticos do roteiro do mobile (§8). Existem para que
         * nenhuma cor literal precise aparecer no JSX: `text-critical` em vez
         * de `text-red-600`, que ninguém consegue redefinir no tema escuro.
         *
         * `critical` tem dois tons de propósito: `fill` é a cor cheia da faixa
         * (sem texto por cima) e o DEFAULT é o tom escurecido, legível como
         * texto sobre branco.
         */
        critical: {
          DEFAULT: 'hsl(var(--critical))',
          fill: 'hsl(var(--critical-fill))',
          soft: 'hsl(var(--critical-soft))'
        },
        warn: {
          DEFAULT: 'hsl(var(--warn))',
          soft: 'hsl(var(--warn-soft))'
        },
        positive: {
          DEFAULT: 'hsl(var(--positive))',
          soft: 'hsl(var(--positive-soft))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))'
        },
        'on-fill': 'hsl(var(--on-fill))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          /* Fundo suave do acento: pílula da navegação e realces. */
          soft: 'hsl(var(--primary-soft))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
