import { useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)

  return loggedIn ? (
    <Dashboard onLogout={() => setLoggedIn(false)} />
  ) : (
    <Login onLogin={() => setLoggedIn(true)} />
  )
}

export default App
