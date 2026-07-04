import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom'
import { usePlayer } from './store.jsx'
import { Logo, RankBadge } from './components/ui.jsx'
import Landing from './screens/Landing.jsx'
import Login from './screens/Login.jsx'
import CameraCheck from './screens/CameraCheck.jsx'
import Lobby from './screens/Lobby.jsx'
import Battle from './screens/Battle.jsx'
import Solo from './screens/Solo.jsx'
import JoinRoom from './screens/JoinRoom.jsx'
import Admin from './screens/Admin.jsx'
import Results from './screens/Results.jsx'
import Leaderboard from './screens/Leaderboard.jsx'
import Profile from './screens/Profile.jsx'
import Settings from './screens/Settings.jsx'
import { RulesPage, TermsPage, PrivacyPage } from './screens/StaticPages.jsx'

function Header() {
  const { player } = usePlayer()
  const nav = [
    { to: '/lobby', label: 'Баттл' },
    { to: '/leaderboard', label: 'Лидерборд' },
    { to: '/profile', label: 'Профиль' },
  ]
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-ink/80 border-b border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl">
          <Logo />
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `tracking-wide transition-colors ${isActive ? 'text-accent-soft' : 'text-muted hover:text-cream'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {player ? (
            <Link to="/profile" className="flex items-center gap-3 group">
              <span className="hidden sm:block text-right">
                <span className="block text-sm font-semibold group-hover:text-accent-soft transition-colors">
                  {player.nick}
                </span>
                <span className="block text-[11px] text-muted font-display">{player.elo} ELO</span>
              </span>
              <span className="w-9 h-9 rounded-full hairline flex items-center justify-center font-display text-accent-soft">
                {player.nick[0]?.toUpperCase()}
              </span>
            </Link>
          ) : (
            <Link to="/login" className="text-sm text-muted hover:text-accent-soft transition-colors">
              Войти
            </Link>
          )}
        </div>
      </div>
      {player && (
        <div className="sm:hidden border-t border-line">
          <div className="mx-auto max-w-6xl px-4 h-10 flex items-center gap-5 text-xs">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => (isActive ? 'text-accent-soft' : 'text-muted')}
              >
                {n.label}
              </NavLink>
            ))}
            <span className="ml-auto">
              <RankBadge elo={player.elo} size="sm" />
            </span>
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
        <Logo className="text-base" />
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link to="/rules" className="hover:text-accent-soft transition-colors">Правила</Link>
          <Link to="/terms" className="hover:text-accent-soft transition-colors">Условия использования</Link>
          <Link to="/privacy" className="hover:text-accent-soft transition-colors">Конфиденциальность</Link>
          <span className="hairline rounded-full px-2 py-0.5 text-accent-soft/80">18+</span>
        </nav>
        <span>© 2026 LarpBattle. Оценки формирует AI и они не являются экспертизой.</span>
      </div>
    </footer>
  )
}

function RequireAuth({ children }) {
  const { player } = usePlayer()
  if (!player) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const location = useLocation()
  const immersive = location.pathname.startsWith('/battle')
  return (
    <div className="min-h-screen flex flex-col">
      {!immersive && <Header />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/camera-check" element={<RequireAuth><CameraCheck /></RequireAuth>} />
          <Route path="/lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
          <Route path="/battle" element={<RequireAuth><Battle /></RequireAuth>} />
          <Route path="/solo" element={<RequireAuth><Solo /></RequireAuth>} />
          <Route path="/join/:code" element={<RequireAuth><JoinRoom /></RequireAuth>} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!immersive && <Footer />}
    </div>
  )
}
