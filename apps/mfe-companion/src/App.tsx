import { Routes, Route } from 'react-router-dom'
import GameSelectionPage from './pages/GameSelectionPage'
import ArmyBuilderPage from './pages/ArmyBuilderPage'
import PhaseCompanionPage from './pages/PhaseCompanionPage'
import MyArmiesPage from './pages/MyArmiesPage'

export default function App() {
  return (
    <Routes>
      <Route index element={<GameSelectionPage />} />
      <Route path="armies" element={<MyArmiesPage />} />
      <Route path="games/:gameId/army" element={<ArmyBuilderPage />} />
      <Route
        path="games/:gameId/army/:armyId/phases"
        element={<PhaseCompanionPage />}
      />
    </Routes>
  )
}
