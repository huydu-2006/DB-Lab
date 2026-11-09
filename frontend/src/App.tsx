import { useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { restoreSession, clearSession, type AuthSession } from './lib/api'

function App() {
  // Lazy init restores the session-scoped token after a page refresh.
  const [session, setSession] = useState<AuthSession | null>(() => restoreSession())

  const handleLogin = (next: AuthSession) => {
    setSession(next)
  }

  const handleLogout = () => {
    clearSession()
    setSession(null)
  }

  return session ? (
    <Dashboard onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  )
}

export default App
