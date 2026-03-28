/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Hot Pink, Black, White palette
        bg:          '#ffffff',
        surface:     '#f5f5f5',
        'surface-light': '#fafafa',
        border:      '#000000',
        'border-light': '#333333',
        
        // Text colors
        text:        '#000000',
        'text-secondary': '#333333',
        'text-muted': '#666666',
        
        // Accent colors (Hot Pink boldness)
        accent:      '#ff1493',
        'accent-light': '#ff3ead',
        'accent-dark': '#e60a7f',
        
        // Status colors
        success:     '#00ff00',
        'success-light': '#b3ffb3',
        warning:     '#ffaa00',
        'warning-light': '#ffe6b3',
        error:       '#ff1493',
        'error-light': '#ff99d8',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"SF Mono"', '"Monaco"', '"Monaco"', '"Courier New"', 'monospace'],
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.5' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.7' },
        },
        slideDown: {
          'from': { opacity: '0', transform: 'translateY(-10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          'from': { opacity: '0', transform: 'translateY(10px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        blink: 'blink 2s infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink-fast': 'blink 1.4s infinite',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        glow: '0 0 20px rgba(255, 20, 147, 0.4)',
        'glow-lg': '0 0 40px rgba(255, 20, 147, 0.6)',
      },
      borderWidth: {
        1: '1px',
        2: '2px',
        3: '3px',
        4: '4px',
      },
    },
  },
  plugins: [],
}

