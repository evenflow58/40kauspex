import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@40kauspex/auth', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}))

vi.mock('../api', () => ({
  companionApi: {
    getPhaseGuide: vi.fn(),
  },
}))

import { companionApi } from '../api'
import PhaseCompanionPage from './PhaseCompanionPage'

const GUIDE = {
  armyId: 'army-1',
  armyName: 'Green Tide',
  gameId: 'wh40k',
  factionName: 'Orks',
  phases: [
    {
      order: 1,
      name: 'Command Phase',
      description: 'Issue orders to your forces.',
      keyActions: ['Issue Strategic Ploy'],
      relevantKeywords: ['COMMAND'],
      units: [
        {
          entryId: 'e1',
          unitName: 'Warboss',
          matchedKeywords: ['COMMAND'],
          briefAbility: null,
        },
      ],
    },
    {
      order: 2,
      name: 'Movement Phase',
      description: 'Move your models.',
      keyActions: ['Normal Move', 'Advance'],
      relevantKeywords: ['FLY', 'INFANTRY'],
      units: [],
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/games/wh40k/army/army-1/phases']}>
      <Routes>
        <Route
          path="/games/:gameId/army/:armyId/phases"
          element={<PhaseCompanionPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('PhaseCompanionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading indicator while the guide is fetching', () => {
    vi.mocked(companionApi.getPhaseGuide).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading phase companion/i)).toBeInTheDocument()
  })

  it('shows an error card when the guide fails to load', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockRejectedValue(
      new Error('Guide unavailable')
    )
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Guide unavailable')).toBeInTheDocument()
  })

  it('renders the army name and faction name once loaded', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Green Tide' })
    ).toBeInTheDocument()
    expect(screen.getByText(/orks — phase companion/i)).toBeInTheDocument()
  })

  it('renders a tab for each phase', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    expect(
      screen.getByRole('tab', { name: 'Command Phase' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Movement Phase' })
    ).toBeInTheDocument()
  })

  it('marks the first phase as active by default', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    expect(
      screen.getByRole('tab', { name: 'Command Phase' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', { name: 'Movement Phase' })
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('disables the Previous phase button on the first phase', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    expect(
      screen.getByRole('button', { name: /previous phase/i })
    ).toBeDisabled()
  })

  it('advances to the next phase when Next phase is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    await user.click(screen.getByRole('button', { name: /next phase/i }))
    expect(
      screen.getByRole('tab', { name: 'Movement Phase' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', { name: 'Command Phase' })
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('disables the Next phase button on the last phase', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    await user.click(screen.getByRole('button', { name: /next phase/i }))
    expect(
      screen.getByRole('button', { name: /next phase/i })
    ).toBeDisabled()
  })

  it('activates a phase when its tab is clicked directly', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    await user.click(screen.getByRole('tab', { name: 'Movement Phase' }))
    expect(
      screen.getByRole('tab', { name: 'Movement Phase' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('displays units relevant to the active phase', async () => {
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    expect(screen.getByText('Warboss')).toBeInTheDocument()
  })

  it('shows a message when no units match the active phase', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    await user.click(screen.getByRole('button', { name: /next phase/i }))
    expect(
      screen.getByText(/no units in your army have abilities relevant to this phase/i)
    ).toBeInTheDocument()
  })

  it('returns to the previous phase when Previous phase is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.getPhaseGuide).mockResolvedValue(GUIDE)
    renderPage()
    await screen.findByRole('heading', { name: 'Green Tide' })
    await user.click(screen.getByRole('button', { name: /next phase/i }))
    await user.click(screen.getByRole('button', { name: /previous phase/i }))
    expect(
      screen.getByRole('tab', { name: 'Command Phase' })
    ).toHaveAttribute('aria-selected', 'true')
  })
})
