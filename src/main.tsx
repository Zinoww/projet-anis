import {createRoot} from 'react-dom/client'
import {HashRouter} from 'react-router-dom'
import {registerSW} from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import {apply,getPrefs} from './prefs'
apply(getPrefs())
registerSW({immediate:true})
createRoot(document.getElementById('root')!).render(<HashRouter><App/></HashRouter>)
