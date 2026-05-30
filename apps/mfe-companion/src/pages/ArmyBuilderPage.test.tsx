import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@40kauspex/auth', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}))

vi.mock('../api', () => ({
  companionApi: {
    listFactions: vi.fn(),
    listUnits: vi.fn(),
    createArmy: vi.fn(),
  },
  unitToPayload: (unit: {
    unitId: string
    name: string
    keywords: string[]
    movement: number
    hasRanged: boolean
    hasMelee: boolean
    briefAbility: string | null
    battlefieldRole: string
  }) => ({
    unitId: unit.unitId,
    unitName: unit.name,
    keywords: unit.keywords,
    movement: unit.movement,
    hasRanged: unit.hasRanged,
    hasMelee: unit.hasMelee,
    briefAbility: unit.briefAbility,
    battlefieldRole: unit.battlefieldRole,
  }),
}))

import { companionApi } from '../api'
import ArmyBuilderPage from './ArmyBuilderPage'

const FACTIONS = [
  { factionId: 'orks', name: 'Orks' },
  { factionId: 'space-marines', name: 'Space Marines' },
]

// Warboss is "Character" (comes first in ROLE_ORDER), Boyz is "Battleline".
const UNITS = [
  {
    unitId: 'ork-warboss',
    factionId: 'orks',
    name: 'Warboss',
    keywords: ['CHARACTER', 'INFANTRY'],
    movement: 5,
    hasRanged: true,
    hasMelee: true,
    briefAbility: null,
    battlefieldRole: 'Character',
  },
  {
    unitId: 'ork-boyz',
    factionId: 'orks',
    name: 'Boyz',
    keywords: ['INFANTRY', 'CORE'],
    movement: 6,
    hasRanged: true,
    hasMelee: true,
    briefAbility: 'Fight harder.',
    battlefieldRole: 'Battleline',
  },
]

const CREATED_ARMY = {
  armyId: 'new-army',
  name: 'Green Tide',
  gameId: 'wh40k',
  factionId: 'orks',
  factionName: 'Orks',
  units: [],
  createdAt: 't',
  updatedAt: 't',
}

function renderPage(gameId = 'wh40k') {
  return render(
    <MemoryRouter initialEntries={[`/companion/games/${gameId}/army`]}>
      <Routes>
        <Route
          path="/companion/games/:gameId/army"
          element={<ArmyBuilderPage />}
        />
        <Route
          path="/companion/games/:gameId/army/:armyId/phases"
          element={<div data-testid="phases-page" />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ArmyBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading indicator while factions are fetching', () => {
    vi.mocked(companionApi.listFactions).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading factions/i)).toBeInTheDocument()
  })

  it('renders faction buttons once factions are loaded', async () => {
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Orks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Space Marines' })).toBeInTheDocument()
  })

  it('shows an error card when faction loading fails', async () => {
    vi.mocked(companionApi.listFactions).mockRejectedValue(
      new Error('Factions unavailable')
    )
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Factions unavailable')).toBeInTheDocument()
  })

  it('loads and displays units after selecting a faction', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    expect(await screen.findByText('Warboss')).toBeInTheDocument()
    expect(screen.getByText('Boyz')).toBeInTheDocument()
  })

  it('groups units by battlefield role', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    await screen.findByText('Warboss')
    expect(screen.getByText('Character')).toBeInTheDocument()
    expect(screen.getByText('Battleline')).toBeInTheDocument()
  })

  it('adds a unit to the army list when Add is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0]) // Warboss (Character group is first)
    // The name now appears in both the unit browser and the army list.
    expect(screen.getAllByText('Warboss')).toHaveLength(2)
  })

  it('removes a unit from the army list when Remove is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0])
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getAllByText('Warboss')).toHaveLength(1)
  })

  it('disables Save when army name is empty', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0])
    // No name entered — save must remain disabled.
    expect(
      screen.getByRole('button', { name: /save army/i })
    ).toBeDisabled()
  })

  it('disables Save when no units have been added', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    await screen.findByText('Warboss')
    await user.type(screen.getByLabelText(/army name/i), 'Green Tide')
    expect(
      screen.getByRole('button', { name: /save army/i })
    ).toBeDisabled()
  })

  it('enables Save when both name and units are provided', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0])
    await user.type(screen.getByLabelText(/army name/i), 'Green Tide')
    expect(
      screen.getByRole('button', { name: /save army/i })
    ).not.toBeDisabled()
  })

  it('navigates to the phase companion after a successful save', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    vi.mocked(companionApi.createArmy).mockResolvedValue(CREATED_ARMY)
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0])
    await user.type(screen.getByLabelText(/army name/i), 'Green Tide')
    await user.click(screen.getByRole('button', { name: /save army/i }))
    expect(await screen.findByTestId('phases-page')).toBeInTheDocument()
  })

  it('shows a save error when createArmy rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(companionApi.listFactions).mockResolvedValue(FACTIONS)
    vi.mocked(companionApi.listUnits).mockResolvedValue(UNITS)
    vi.mocked(companionApi.createArmy).mockRejectedValue(new Error('Save failed'))
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Orks' }))
    const addButtons = await screen.findAllByRole('button', { name: 'Add' })
    await user.click(addButtons[0])
    await user.type(screen.getByLabelText(/army name/i), 'Green Tide')
    await user.click(screen.getByRole('button', { name: /save army/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })
})
