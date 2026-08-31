/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './assets/js/*.js', './data/*.js'],
  theme: {
    extend: {
      colors: {
        ivory:  { DEFAULT: '#FAF7F3', deep: '#F2ECE4' },
        ink:    { DEFAULT: '#2E2A28', soft: '#5C5451', mute: '#8A807B' },
        plum:   { DEFAULT: '#6B4B5E', dark: '#523A48', light: '#8E6B7E' },
        rose:   { DEFAULT: '#C9A399', light: '#E8D7D0' },
        sage:   { DEFAULT: '#8FA396' },
        gold:   { DEFAULT: '#B08D57' }
      },
      fontFamily: {
        display: ['Amiri', 'Georgia', 'serif'],
        sans: ['Tajawal', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(46,42,40,.04), 0 8px 24px -12px rgba(46,42,40,.18)',
        lift: '0 2px 4px rgba(46,42,40,.06), 0 18px 40px -16px rgba(46,42,40,.28)'
      },
      maxWidth: { content: '1180px' },
      opacity: { 4: '.04', 8: '.08', 12: '.12', 15: '.15', 18: '.18', 35: '.35', 45: '.45', 55: '.55', 65: '.65', 85: '.85' }
    }
  },
  plugins: []
}
