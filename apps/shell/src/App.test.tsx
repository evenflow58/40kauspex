import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// The shell lazy-loads the federated remote `mfe_home/App`, which is only
// resolvable from a built remote at runtime. `vitest.config.ts` aliases that
// import to `src/test/mfe-home-stub.tsx` so the shell can be unit-tested in
// isolation; the stub renders an element with data-testid="remote-home".
import App from './App'

describe('shell App', () => {
  it('renders without crashing', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: '40K Auspex' })
    ).toBeInTheDocument()
  })

  it('renders the app title in the header', () => {
    render(<App />)
    const heading = screen.getByRole('heading', { name: '40K Auspex' })
    expect(heading.tagName).toBe('H1')
  })

  it('renders the Refresh button', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: /refresh/i })
    ).toBeInTheDocument()
  })

  it('shows the Shell subtitle label', () => {
    render(<App />)
    expect(screen.getByText('Shell')).toBeInTheDocument()
  })

  it('eventually renders the federated remote inside the Suspense boundary', async () => {
    render(<App />)
    // React.lazy resolves asynchronously; findBy* waits for it.
    expect(await screen.findByTestId('remote-home')).toBeInTheDocument()
  })
})
