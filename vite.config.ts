/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths, so the build runs at GitHub Pages' /expo_planner/ as well as at a root.
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
