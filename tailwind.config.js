/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        luna: {
          white: 'var(--text-primary)',
          silver: 'var(--text-secondary)',
          ghost: '#F5F5FA',
          mist: '#D0D0E0',
          slate: 'var(--text-muted)',
          shadow: 'var(--bg-elevated)',
          dark: 'var(--bg-base)',
          accent: {
            primary: 'var(--accent-primary)',
            secondary: 'var(--accent-secondary)',
            glow: 'var(--accent-glow)',
          }
        }
      },
      backgroundImage: {
        'mesh-gradient': 'radial-gradient(at 40% 20%, rgba(224, 224, 255, 0.3) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(240, 240, 255, 0.2) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(192, 192, 255, 0.2) 0px, transparent 50%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'luna-sm': '0 2px 8px rgba(224, 224, 255, 0.1)',
        'luna-md': '0 4px 16px rgba(224, 224, 255, 0.15)',
        'luna-lg': '0 8px 32px rgba(224, 224, 255, 0.2)',
        'luna-glow': '0 0 20px rgba(224, 224, 255, 0.3)',
        'luna-inner': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
