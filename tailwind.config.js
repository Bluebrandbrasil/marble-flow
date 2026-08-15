/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          emerald: '#10b981', // Production
          neon: '#ff6b00',    // Queue/Pending
          ruby: '#e11d48',    // Alerts/Returns
          dark: '#0a0a0a',    // Deep dark background
          darker: '#050505',
          rocha: {
            bg: '#F8FAFC',
            card: '#FFFFFF',
            border: '#E2E8F0',
            primary: '#7C3AED',
          }
        }
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
      }
    },
  },
  plugins: [],
}
