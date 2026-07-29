/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta "Índigo clínico": mantém os nomes semânticos (plum/gold/noble)
        // usados em toda a interface para que a troca de tons não exija tocar
        // em componentes — só os valores hexadecimais mudam.
        plum: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        gold: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        noble: {
          50: '#f8fafc',
          100: '#f1f5f9',
          150: '#eaeff5',
          200: '#e2e8f0',
          250: '#d7dfe9',
          300: '#cbd5e1',
          350: '#b0bccd',
          400: '#94a3b8',
          450: '#7c8ca2',
          500: '#64748b',
          550: '#56657a',
          600: '#475569',
          650: '#3d4b5f',
          700: '#334155',
          750: '#293548',
          800: '#1e293b',
          850: '#172033',
          900: '#0f172a',
          950: '#020617',
        },
      },
      boxShadow: {
        card: '0 10px 25px -12px rgba(44,44,44,0.35)',
      },
    },
  },
  plugins: [],
}
