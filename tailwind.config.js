/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './product/**/*.html', './src/**/*.html',
            './assets/js/*.js', './data/*.js', './build.mjs'],
  theme: {
    extend: {
      colors: {
        /* Surfaces: no white anywhere. The page sits on warm oat, cards lift
           off it a shade lighter, `deep` is the recessed step below the page. */
        page:   { DEFAULT: '#EFE6DA' },
        card:   { DEFAULT: '#F8F3EC' },
        deep:   { DEFAULT: '#E4D9C9' },
        /* `ivory` is now only a light FOREGROUND, used on the dark plum section */
        ivory:  { DEFAULT: '#FAF7F3', deep: '#F2ECE4' },
        ink:    { DEFAULT: '#2E2A28', soft: '#5C5451', mute: '#635A55' },
        plum:   { DEFAULT: '#6B4B5E', dark: '#523A48', light: '#6F5062' },
        rose:   { DEFAULT: '#C9A399', light: '#E8D7D0' },
        sage:   { DEFAULT: '#8FA396' },
        gold:   { DEFAULT: '#B08D57' },
        /* WhatsApp brand green fails 4.5:1 with white text (1.98:1);
           this deeper green keeps the signal and passes AA at 5.42:1 */
        whats:  { DEFAULT: '#0F7A3D', dark: '#0B6231' },
        danger: { DEFAULT: '#9B2C2C' },
        /* Section tints drawn from her own fabrics — one per garment in the
           collection, so the site's colour comes from the product, not a stock palette */
        blush:  { DEFAULT: '#F1DCD3', deep: '#E8CDC1', ink: '#7A4A38' },  /* AS-01 rose floral */
        lilac:  { DEFAULT: '#E6DAEC', deep: '#D9C8E2', ink: '#5F3B7A' },  /* AS-02 purple damask */
        mint:   { DEFAULT: '#D9E8DF', deep: '#C6DCCF', ink: '#3F6B52' },  /* AS-03 mint & rose */
        sand:   { DEFAULT: '#EEE0C6', deep: '#EBDAC0', ink: '#7A5B2E' },  /* AS-04 cream satin */
        sky:    { DEFAULT: '#DDE6EF', deep: '#C9D8E4', ink: '#3D5670' }   /* AS-05 blue floral */
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
