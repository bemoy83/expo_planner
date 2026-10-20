import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the app title', async () => {
    render(<App />)
    // With a Supabase project set up, the app first reads whether someone is signed in.
    expect(await screen.findByRole('heading', { name: 'Expo Planner' })).toBeDefined()
  })
})
