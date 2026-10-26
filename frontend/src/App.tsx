import Login from './Login'
import Dashboard from './Dashboard'
import { useState } from 'react'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)

  return loggedIn
  ? <Dashboard onLogout={() => setLoggedIn(false)} />
  : <Login onLogin={() => setLoggedIn(true)} />
}

export default App
