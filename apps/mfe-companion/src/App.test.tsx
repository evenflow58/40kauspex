import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The companion pages call `companionApi` (network) and `useAuth` (the shared
// auth singleton). Both are mocked so the routing and rendering can be tested
// in isolation without a deployed API or a real OIDC session.
vi.mock('@40kauspex/auth', () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    isConfigured: true,
    user: { id: 'u1', email: 'pilot@40kauspex.test', name: 'Pilot', picture: null },
    accessToken: 'test-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('./api', () => ({
  companionApi: {
    listGames: vi.fn().mockResolvedValue([
      {
        gameId: 'warhammer-40k',
        name: 'Warhammer 40,000',
        available: true,
        description: 'The grim darkness of the far future.',
      },
      {
        gameId: 'age-of-sigmar',
        name: 'Age of Sigmar',
        available: false,
        description: 'Battles in the Mortal Realms.',
      },
    ]),
    listFactions: vi.fn().mockResolvedValue([]),
    listUnits: vi.fn().mockResolvedValue([]),
    listPhases: vi.fn().mockResolvedValue([]),
    getPhaseGuide: vi.fn().mockResolvedValue({ phases: [] }),
  },
  unitToPayload: vi.fn(),
  armyUnitToPayload: vi.fn(),
}))

import App from './App'

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  )
}

describe('mfe-companion App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the game selection page at /companion', async () => {
    renderApp('/companion')
    expect(
      await screen.findByRole('heading', { name: /choose your game/i })
    ).toBeInTheDocument()
  })

  it('lists available games loaded from the API', async () => {
    renderApp('/companion')
    expect(await screen.findByText('Warhammer 40,000')).toBeInTheDocument()
  })

  it('marks unavailable games as coming soon with a disabled action', async () => {
    renderApp('/companion')
    expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /not available yet/i })
    ).toBeDisabled()
  })

  it('redirects an unknown companion path to game selection', async () => {
    renderApp('/companion/nonsense/path')
    expect(
      await screen.findByRole('heading', { name: /choose your game/i })
    ).toBeInTheDocument()
  })
})
