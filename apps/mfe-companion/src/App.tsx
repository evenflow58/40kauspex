import { Routes, Route, Navigate } from 'react-router-dom'
import GameSelectionPage from './pages/GameSelectionPage'
import ArmyBuilderPage from './pages/ArmyBuilderPage'
import PhaseCompanionPage from './pages/PhaseCompanionPage'

/**
 * Root of the companion micro-frontend.
 *
 * Consumed by the shell over Module Federation under the `/companion/*` route,
 * so this component defines its routes with the full `/companion`-prefixed
 * paths (the shell mounts it inside a wildcard route and supplies the router).
 *
 *   /companion                                       game selection
 *   /companion/games/:gameId/army                    army builder
 *   /companion/games/:gameId/army/:armyId/phases      phase companion
 */
export default function App() {
  return (
    <Routes>
      <Route path="/companion" element={<GameSelectionPage />} />
      <Route
        path="/companion/games/:gameId/army"
        element={<ArmyBuilderPage />}
      />
      <Route
        path="/companion/games/:gameId/army/:armyId/phases"
        element={<PhaseCompanionPage />}
      />
      {/* Any unknown companion path falls back to game selection. */}
      <Route path="*" element={<Navigate to="/companion" replace />} />
    </Routes>
  )
}
