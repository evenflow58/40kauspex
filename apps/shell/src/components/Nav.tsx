import { NavLink } from 'react-router-dom'
import { Home, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/companion', label: 'Companion', icon: Swords },
]

export default function Nav() {
  return (
    <nav aria-label="Primary">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground',
                ].join(' ')
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
