import themePreset from '@wippy-fe/theme/tailwind.config'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [themePreset],
  content: [
    './src/**/*.{vue,ts}',
  ],
}
