# Terrain (MVP)
1. Créer un projet gratuit sur supabase.com, coller `supabase/schema.sql` dans SQL Editor.
2. `cp .env.example .env` puis renseigner URL et clé anon (Settings > API).
3. `npm install && npm run dev`
4. Créer un compte dans l'app, puis lancer l'insert de démo commenté en bas du SQL.
5. Déploiement gratuit : Cloudflare Pages ou Vercel (`npm run build`, dossier `dist`, variables VITE_*).
Hors-ligne : les PV sont stockés dans IndexedDB et envoyés automatiquement au retour du réseau.

## Déploiement GitHub Pages
1. Pousser sur la branche `main` d'un dépôt GitHub public.
2. Settings > Pages > Source : GitHub Actions.
3. Settings > Secrets and variables > Actions : ajouter VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (et VITE_REFERRAL_BASE).
4. Chaque `git push` sur `main` redéploie automatiquement.
