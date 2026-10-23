/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths, so the build runs at GitHub Pages' /expo_planner/ as well as at a root.
  base: './',
  plugins: [react()],
  test: {
    // The tests of pure logic run without a DOM, which takes most of the time to start; a .ts test that needs one says so in its first line.
    projects: [
      { extends: true, test: { name: 'logic', include: ['src/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'dom', include: ['src/**/*.test.tsx'], environment: 'jsdom' } },
    ],
  },
})
