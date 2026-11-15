import {createRoot} from 'react-dom/client'
import {HashRouter} from 'react-router-dom'
import {registerSW} from 'virtual:pwa-register'
import App from './App'
import {ErrorBoundary} from './ErrorBoundary'
import './styles.css'
import {apply,getPrefs} from './prefs'
apply(getPrefs())
registerSW({immediate:true})
createRoot(document.getElementById('root')!).render(<ErrorBoundary><HashRouter><App/></HashRouter></ErrorBoundary>)
