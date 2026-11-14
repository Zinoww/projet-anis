import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
export default defineConfig({base:process.env.VITE_BASE??'/',plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Terrain',short_name:'Terrain',display:'standalone',background_color:'#eef1f4',theme_color:'#0f4c5c',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},workbox:{navigateFallback:'index.html'}})]})
