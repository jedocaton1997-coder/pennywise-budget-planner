import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './styles/bank-components.css'
import './styles/glass-system.css'
import './styles/accounts-cards-premium.css'
import { initializeFirebaseAnalytics } from './lib/firebase'
import AuthGate from './AuthGate'

void initializeFirebaseAnalytics()

createRoot(document.getElementById('root')!).render(<StrictMode><AuthGate><App /></AuthGate></StrictMode>)
