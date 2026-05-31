import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@40kauspex/auth', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}))

vi.mock('../api', () => ({
  companionApi: {
    listArmies: vi.fn(),
  },
}))

import { companionApi } from '../api'
import MyArmiesPage from './MyArmiesPage'

const ARMIES = [
  {
    armyId: 'army-1',
    name: 'Strike Force Ultima',
    gameId: 'wh40k',
    factionId: 'ultramarines',
    factionName: 'Ultramarines',
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
  },
  {
    armyId: 'army-2',
    name: 'Green Tide',
    gameId: 'wh40k',
    factionId: 'orks',
    factionName: 'Orks',
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-25T10:00:00.000Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/armies']}>
      <Routes>
        <Route path="/armies" element={<MyArmiesPage />} />
        <Route
          path="/companion/games/:gameId/army/:armyId/phases"
          element={<div>Phase companion for army</div>}
        />
        <Route path="/companion" element={<div>Game selection</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MyArmiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading indicator while armies are fetching', () => {
    vi.mocked(companionApi.listArmies).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading your armies/i)).toBeInTheDocument()
  })

  it('renders each army once loaded', async () => {
    vi.mocked(companionApi.listArmies).mockResolvedValue(ARMIES)
    renderPage()
    expect(await screen.findByText('Strike Force Ultima')).toBeInTheDocument()
    expect(screen.getByText('Green Tide')).toBeInTheDocument()
    expect(screen.getByText('Ultramarines')).toBeInTheDocument()
    expect(screen.getByText('Orks')).toBeInTheDocument()
  })

  it('sorts armies by most-recently-updated first', async () => {
    vi.mocked(companionApi.listArmies).mockResolvedValue(ARMIES)
    renderPage()
    // The button aria-labels include the army name; their order in the DOM
    // reflects card order. Green Tide updatedAt > Strike Force Ultima
    // updatedAt, so it should appear first.
    await screen.findByText('Strike Force Ultima')
    const buttons = screen.getAllByRole('button', {
      name: /open phase companion for/i,
    })
    expect(buttons[0]).toHaveAttribute(
      'aria-label',
      'Open phase companion for Green Tide'
    )
    expect(buttons[1]).toHaveAttribute(
      'aria-label',
      'Open phase companion for Strike Force Ultima'
    )
  })

  it('passes the auth token from useAuth to listArmies', async () => {
    vi.mocked(companionApi.listArmies).mockResolvedValue(ARMIES)
    renderPage()
    await screen.findByText('Strike Force Ultima')
    expect(companionApi.listArmies).toHaveBeenCalledWith('test-token')
  })

  it('shows an empty state when the user has no armies', async () => {
    vi.mocked(companionApi.listArmies).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no armies yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /build an army/i })
    ).toHaveAttribute('href', '/companion')
  })

  it('shows an error card when the API call fails', async () => {
    vi.mocked(companionApi.listArmies).mockRejectedValue(
      new Error('Network error')
    )
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('retries the API call when Try again is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listArmies)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(ARMIES)
    renderPage()
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Strike Force Ultima')).toBeInTheDocument()
    expect(vi.mocked(companionApi.listArmies)).toHaveBeenCalledTimes(2)
  })

  it('navigates to the phase companion when an army is opened', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listArmies).mockResolvedValue(ARMIES)
    renderPage()
    await screen.findByText('Strike Force Ultima')
    await user.click(
      screen.getByRole('button', {
        name: /open phase companion for strike force ultima/i,
      })
    )
    expect(
      await screen.findByText('Phase companion for army')
    ).toBeInTheDocument()
  })

  it('links the back button to the game selection page', async () => {
    vi.mocked(companionApi.listArmies).mockResolvedValue(ARMIES)
    renderPage()
    await screen.findByText('Strike Force Ultima')
    expect(
      screen.getByRole('link', { name: /back to games/i })
    ).toHaveAttribute('href', '/companion')
  })
})
