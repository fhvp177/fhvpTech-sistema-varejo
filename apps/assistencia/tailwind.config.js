/** @type {import('tailwindcss').Config} */
module.exports = {
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
        // ── PALETA DO NICHO: petróleo + grafite ────────────────────────────
        //
        // A assistência não pode parecer o varejo. A troca acontece AQUI, no
        // tema, e não arquivo por arquivo, por dois motivos:
        //
        //  1. Boa parte da cara do app vem de componentes do @fhvptech/core
        //     (sino, tour, guia, tela de licença) que têm cor fixa e são
        //     COMPARTILHADOS com o varejo. Editá-los mudaria os dois apps.
        //     Como cada app compila o próprio CSS a partir do próprio config —
        //     e os dois varrem o core no `content` acima —, redefinir a escala
        //     aqui alcança o core sem encostar no varejo.
        //  2. É reversível de verdade: desfazer a paleta é desfazer este bloco.
        //
        // ⚠️ O PREÇO, e ele é real: os NOMES das classes passam a mentir.
        // `bg-slate-900` pinta grafite, `text-blue-600` pinta petróleo. Quem ler
        // o JSX vê "blue" e recebe teal. Enquanto a paleta estiver em avaliação
        // isso vale a pena; se ela for mantida, o certo é renomear as classes
        // nos ~290 pontos do app e tokenizar o que dá no core.
        //
        // Semânticas ficam INTOCADAS de propósito: âmbar = aviso, vermelho =
        // erro, verde = sucesso. Cor com significado não é decoração.

        // slate → zinc: cinza neutro, sem o azulado do varejo. Os dois tons do
        // "painel escuro" (barra lateral e login) descem um degrau a mais — é o
        // que dá o ar de bancada, e mantém o hover um passo acima do fundo.
        slate: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#18181b', // era zinc-800; escurecido (fundo de hover do menu)
          900: '#09090b', // era zinc-900; escurecido (barra lateral e login)
          950: '#09090b'
        },

        // blue → teal, deslocado um degrau pro escuro do 500 pra cima. Além de
        // diferenciar, conserta contraste: o azul de ação tinha 3,1:1 com o
        // texto branco do botão (abaixo do mínimo de 4,5:1); o petróleo fica
        // em ~5,9:1. Os tons claros (50-400) não deslocam, senão os fundos de
        // selo e as bordas ficariam pesados demais.
        blue: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#0d9488', // teal-600
          600: '#0f766e', // teal-700  ← a cor de ação
          700: '#115e59', // teal-800
          800: '#134e4a', // teal-900
          900: '#042f2e', // teal-950
          950: '#042f2e'
        },

        // cyan → azul. O selo de CFTV era ciano, que agora encostaria no
        // petróleo das ações. O azul ficou livre justamente por deixar de ser a
        // cor de ação, então herda a categoria. (Índigo, do selo "Instalação",
        // fica como está: longe do petróleo.)
        cyan: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554'
        },

        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
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
