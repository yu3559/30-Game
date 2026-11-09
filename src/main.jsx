import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import { unlockAudio } from './audio.js'
import './styles.css'

window.addEventListener('pointerdown', () => unlockAudio(), { once: true })

createRoot(document.getElementById('root')).render(<App />)
