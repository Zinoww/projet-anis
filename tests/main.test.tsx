// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'

const fx=vi.hoisted(()=>({data:{} as Record<string,any[]>,role:'tech',signedError:'' }))
vi.mock('qrcode',()=>({default:{toDataURL:async()=>'data:image/png;base64,AAAA'}}))
vi.mock('../src/lib/supabase',()=>{
  const chain=(t:string)=>{const p:any=new Proxy(function(){},{get:(_,k)=>{
    if(k==='then')return(res:any,rej:any)=>Promise.resolve({data:fx.data[t]??[],error:null}).then(res,rej)
    if(k==='single'||k==='maybeSingle')return()=>Promise.resolve({data:(t==='profiles'?{...(fx.data.profiles?.[0]??{}),role:fx.role}:fx.data[t]?.[0])??null,error:null})
    return()=>p},apply:()=>p});return p}
  return{supabase:{from:chain,
    rpc:async(n:string,a:any)=>{if(n==='use_stock'){const s=fx.data.stock_items.find(x=>x.id===a.item);if(s)s.qty=Math.max(0,s.qty-a.n)}return{error:null}},
    storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>fx.signedError?({data:null,error:{message:fx.signedError}}):({data:{signedUrl:'https://signed/doc.pdf'},error:null}),createSignedUrls:async()=>({data:[],error:null})})},
    auth:{getSession:async()=>({data:{session:{user:{id:'u1',email:'tech@x.fr'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})}}}})
import {db} from '../src/lib/db'
import App from '../src/App'

const at=(h:number,plus=0)=>{const d=new Date();d.setDate(d.getDate()+plus);d.setHours(h,0,0,0);return d.toISOString()}
const IV=[{id:'i1',ref:'R1',client:'Mme Lefèvre',address:'12 rue A',city:'Rouen',scheduled_at:at(9),status:'planifiee',notes:null},
          {id:'i2',ref:'R2',client:'M. Benali',address:'5 rue B',city:'Elbeuf',scheduled_at:at(14,2),status:'en_cours',notes:null},
          {id:'i3',ref:'R3',client:'Mme Roussel',address:'1 rue C',city:'Darnétal',scheduled_at:at(10,-2),status:'a_replanifier',notes:null}]
const show=(path:string)=>render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>)
const text=async(t:string|RegExp)=>expect((await screen.findAllByText(t)).length).toBeGreaterThan(0)
beforeEach(async()=>{
  fx.role='tech';fx.signedError=''
  fx.data={interventions:IV.map(x=>({...x})),profiles:[{id:'u1',full_name:'Tech Un',role:'tech',referral_code:'ABC123'}],stock_items:[{id:'s1',barcode:'3760000000017',name:'Vanne',qty:4,assigned_to:'u1'}],
    activity:[],pv:[],documents:[{id:'d1',tech_id:'u1',type:'Kbis / avis SIRENE',title:'Mon Kbis',issued_on:null,expires_on:'2030-01-01',file_path:'u1/kbis.pdf'}],
    invoices:[{id:'v1',number:'F-2026-0001',client:'Client X',amount:100,status:'brouillon',created_at:new Date().toISOString()}],billing_profiles:[],referrals:[{kind:'installation'},{kind:'demande'}]}
  await Promise.all(db.tables.map(t=>t.clear()));await db.interventions.bulkPut(IV as any);await db.stock.bulkPut(fx.data.stock_items as any)
  localStorage.clear();document.documentElement.removeAttribute('data-theme')
})
afterEach(()=>{cleanup();vi.restoreAllMocks()})

describe('app principale (technicien) : chaque écran s\'affiche',()=>{
  const routes:[string,string][]=[['/m','Application terrain'],['/m/interventions','Suivi des interventions'],['/m/planning','Les 7 prochains jours'],['/m/tournees','Tournée optimisée'],
    ['/m/optimiseur','2. Arrêts à visiter'],['/m/materiel','Mon matériel'],['/m/documents','Mes documents'],['/m/factures','Mes informations de facturation'],['/m/apporteur','Mon lien apporteur — pompe à chaleur']]
  for(const[path,t]of routes)it(`${path} → ${t}`,async()=>{show(path);await text(t)})
  it('accueil : compteurs corrects (1 aujourd\'hui, 1 en retard, 3 ouvertes)',async()=>{
    show('/m');await text("Aujourd'hui");await text('sur 3 au total');expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3)})
  it('interventions : le filtre statut fonctionne',async()=>{
    show('/m/interventions');await text('Mme Lefèvre')
    fireEvent.click(screen.getByText(/Filtres par colonne/));fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'en_cours'}})
    await waitFor(()=>expect(screen.queryByText('Mme Lefèvre')).toBeNull());expect(screen.getByText('M. Benali')).toBeTruthy()})
  it('interventions : CLIC sur une ligne → détail',async()=>{
    show('/m/interventions');fireEvent.click(await screen.findByText('Mme Lefèvre'));await text('Procès-verbal')})
  it('inventaire : « Droits insuffisants » pour un technicien',async()=>{show('/m/inventaire');await text('Droits insuffisants.')})
  it('administration : « Droits insuffisants » pour un technicien',async()=>{show('/m/admin');await text('Droits insuffisants.')})
  it('matériel : affiche le stock confié',async()=>{show('/m/materiel');await text('Vanne')})
  it('factures : liste + PDF + avertissement des champs manquants',async()=>{
    show('/m/factures');await text('F-2026-0001');await text(/À compléter pour des factures conformes/);expect(screen.getByText('PDF')).toBeTruthy()})
  it('lien apporteur : lien avec le code, compteurs, récompense, QR',async()=>{
    show('/m/apporteur');expect(await screen.findByDisplayValue(/code=ABC123/)).toBeTruthy();await text('Récompense prévue :')
    fireEvent.click(screen.getByText('QR code et envoi par e-mail'));expect(await screen.findByAltText('QR code du lien apporteur')).toBeTruthy()})
})
describe('menu Plus et réglages',()=>{
  it('technicien : pas de tuile Administration',async()=>{show('/m');fireEvent.click(await screen.findByText('Plus'));await text('Mon inventaire');expect(screen.queryByText('Administration')).toBeNull()})
  it('administrateur : tuile Administration + écran admin',async()=>{
    fx.role='admin';show('/m');fireEvent.click(await screen.findByText('Plus'));await text('Administrateur');fireEvent.click(await screen.findByText('Administration'))
    await text('+ Nouvelle intervention');await text('Équipe')})
  it('administrateur : inventaire visible',async()=>{fx.role='admin';show('/m/inventaire');await text("Inventaire de l'équipe")})
  it('mode sombre / clair change le thème',async()=>{
    show('/m');fireEvent.click(await screen.findByText('Plus'));fireEvent.click(await screen.findByText(/Mode sombre/))
    expect(document.documentElement.dataset.theme).toBe('dark');fireEvent.click(screen.getByText(/Mode sombre/));expect(document.documentElement.dataset.theme).toBe('light')})
  it('affichage compact',async()=>{show('/m');fireEvent.click(await screen.findByText('Plus'));fireEvent.click(await screen.findByText(/Affichage compact/));expect(document.documentElement.classList.contains('compact')).toBe(true)})
  it('aide',async()=>{show('/m');fireEvent.click(await screen.findByText('Plus'));fireEvent.click(await screen.findByText('Aide'));await text(/Accueil : vos chiffres du jour/)})
})
describe('documents : bouton Ouvrir',()=>{
  it('ouvre le fichier via un lien signé',async()=>{
    const w={location:{href:''},close:vi.fn()};vi.stubGlobal('open',vi.fn(()=>w))
    show('/m/documents');fireEvent.click(await screen.findByText('Ouvrir'))
    await waitFor(()=>expect(w.location.href).toBe('https://signed/doc.pdf'));expect(w.close).not.toHaveBeenCalled()})
  it('fichier introuvable → message visible (pas de silence) et onglet fermé',async()=>{
    fx.signedError='Object not found';const w={location:{href:''},close:vi.fn()};vi.stubGlobal('open',vi.fn(()=>w))
    show('/m/documents');fireEvent.click(await screen.findByText('Ouvrir'));await text(/Fichier introuvable/);expect(w.close).toHaveBeenCalled()})
  it('popup bloquée → ouvre dans le même onglet',async()=>{
    vi.stubGlobal('open',vi.fn(()=>null));const loc={href:''};vi.stubGlobal('location',loc)
    show('/m/documents');fireEvent.click(await screen.findByText('Ouvrir'));await waitFor(()=>expect(loc.href).toBe('https://signed/doc.pdf'))})
})
describe('scanner',()=>{
  it('saisie d\'un code connu → article trouvé → Utiliser 1 unité (stock 4 → 3, file vidée)',async()=>{
    show('/scan');fireEvent.change(await screen.findByPlaceholderText(/saisir code-barres/),{target:{value:'3760000000017'}})
    await text('4 en stock');fireEvent.click(screen.getByText('Utiliser 1 unité'))
    await waitFor(async()=>{expect((await db.stock.get('s1'))!.qty).toBe(3);expect(await db.stockops.count()).toBe(0)})})
  it('code inconnu → message clair',async()=>{
    show('/scan');fireEvent.change(await screen.findByPlaceholderText(/saisir code-barres/),{target:{value:'000'}});await text('Aucun article confié ne correspond à ce code.')})
  it('stock vide → explication',async()=>{
    fx.data.stock_items=[];await db.stock.clear();show('/scan');await text(/Aucun matériel confié/);await text('Mon stock (0)')})
  it('bouton Actualiser',async()=>{show('/scan');fireEvent.click(await screen.findByText('Actualiser'));await text('Stock à jour.')})
  it('caméra sans HTTPS → message clair',async()=>{
    vi.stubGlobal('isSecureContext',false);show('/scan');fireEvent.click(await screen.findByText('Scanner un code-barres'));await text(/La caméra exige une adresse HTTPS/)})
})
describe('activité, calendrier, PV, profil, hors-ligne',()=>{
  it('activité : enregistre la journée',async()=>{
    show('/act');fireEvent.change(await screen.findByLabelText('Heures travaillées'),{target:{value:'7.5'}});fireEvent.change(screen.getByLabelText('Kilomètres'),{target:{value:'40'}})
    fireEvent.click(screen.getByText('Enregistrer'))
    await waitFor(async()=>{const a=await db.activity.get(new Date().toLocaleDateString('sv'));expect(a?.hours).toBe(7.5);expect(a?.km).toBe(40)})})
  it('calendrier : légende complète + points de statut',async()=>{
    const{container}=show('/cal');for(const l of['Planifiée','En cours','Terminée','À replanifier','Activité déclarée'])await text(l)
    await waitFor(()=>expect(container.querySelectorAll('.dots i').length).toBeGreaterThanOrEqual(3))})
  it('hors ligne : bandeau + PV en attente visible dans l\'onglet PV',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    await db.outbox.put({id:'p1',intervention_id:'i1',tech_id:'u1',outcome:'ok',work_done:'',started_at:'',ended_at:new Date().toISOString(),signature:'x',photos:[]})
    show('/pv');await text(/Hors ligne/);await text('Mme Lefèvre');await text(/À envoyer/)})
  it('profil : compteur de PV à envoyer + lien vers l\'app principale',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    await db.outbox.put({id:'p1',intervention_id:'i1',tech_id:'u1',outcome:'ok',work_done:'',started_at:'',ended_at:'',signature:'x',photos:[]})
    show('/me');await text('1 PV à envoyer');await text("Ouvrir l'application principale")})
})
