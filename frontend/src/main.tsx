import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

// Present in production: the app authenticates through Clerk (Google OAuth /
// email + password) and the backend verifies the session JWT. Absent: the
// dev-fallback flow (backend /api/auth/dev/*) or offline demo mode.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
