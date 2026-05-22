import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import App from './App'

describe('mfe-home App', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('renders the card title and description', () => {
    render(<App />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(
      screen.getByText(/Served by the mfe-home micro-frontend/i)
    ).toBeInTheDocument()
  })

  it('renders the "Get started" call-to-action button', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: 'Get started' })
    ).toBeInTheDocument()
  })

  it('references the shared @40kauspex/ui package in its content', () => {
    render(<App />)
    expect(screen.getByText('@40kauspex/ui')).toBeInTheDocument()
  })
})
