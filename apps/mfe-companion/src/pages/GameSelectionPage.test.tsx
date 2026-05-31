import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../api', () => ({
  companionApi: {
    listGames: vi.fn(),
  },
}))

import { companionApi } from '../api'
import GameSelectionPage from './GameSelectionPage'

const GAMES = [
  {
    gameId: 'wh40k',
    name: 'Warhammer 40,000',
    available: true,
    description: 'The grim darkness.',
  },
  {
    gameId: 'aos',
    name: 'Age of Sigmar',
    available: false,
    description: 'Mortal Realms.',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <GameSelectionPage />
    </MemoryRouter>
  )
}

describe('GameSelectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading indicator while games are fetching', () => {
    vi.mocked(companionApi.listGames).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading games/i)).toBeInTheDocument()
  })

  it('renders all games once loaded', async () => {
    vi.mocked(companionApi.listGames).mockResolvedValue(GAMES)
    renderPage()
    expect(await screen.findByText('Warhammer 40,000')).toBeInTheDocument()
    expect(screen.getByText('Age of Sigmar')).toBeInTheDocument()
  })

  it('renders a My Armies link in the header', () => {
    vi.mocked(companionApi.listGames).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(
      screen.getByRole('link', { name: /my armies/i })
    ).toHaveAttribute('href', '/companion/armies')
  })

  it('enables the Build action for available games', async () => {
    vi.mocked(companionApi.listGames).mockResolvedValue(GAMES)
    renderPage()
    expect(
      await screen.findByRole('button', { name: /build an army/i })
    ).not.toBeDisabled()
  })

  it('marks unavailable games with "Coming soon" and a disabled button', async () => {
    vi.mocked(companionApi.listGames).mockResolvedValue(GAMES)
    renderPage()
    expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /not available yet/i })
    ).toBeDisabled()
  })

  it('shows an error card when the API call fails', async () => {
    vi.mocked(companionApi.listGames).mockRejectedValue(new Error('Network error'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('retries the API call when Try again is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listGames)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(GAMES)
    renderPage()
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Warhammer 40,000')).toBeInTheDocument()
    expect(vi.mocked(companionApi.listGames)).toHaveBeenCalledTimes(2)
  })
})
