// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'

const fx=vi.hoisted(()=>({data:{} as Record<string,any[]>,role:'tech'}))
vi.mock('qrcode',()=>({default:{toDataURL:async()=>'data:image/png;base64,AAAA'}})) // jsdom n'a pas de canvas
vi.mock('../src/lib/supabase',()=>{
  const chain=(t:string)=>{const p:any=new Proxy(function(){},{get:(_,k)=>{
    if(k==='then')return(res:any,rej:any)=>Promise.resolve({data:fx.data[t]??[],error:null}).then(res,rej)
    if(k==='single'||k==='maybeSingle')return()=>Promise.resolve({data:(t==='profiles'?{...(fx.data.profiles?.[0]??{}),role:fx.role}:fx.data[t]?.[0])??null,error:null})
    return()=>p},apply:()=>p});return p}
  return{supabase:{from:chain,rpc:async()=>({error:null}),
    storage:{from:()=>({upload:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:'https://signed/x'},error:null}),createSignedUrls:async()=>({data:[],error:null})})},
    auth:{getSession:async()=>({data:{session:{user:{id:'u1',email:'tech@x.fr'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})}}}})
import {db} from '../src/lib/db'
import App from '../src/App'

const at=(h:number)=>{const d=new Date();d.setHours(h,0,0,0);return d.toISOString()}
const IV=[{id:'i1',ref:'R1',client:'Mme Lefèvre',address:'12 rue A',city:'Rouen',scheduled_at:at(9),status:'planifiee',notes:'Chaudière'},
          {id:'i2',ref:'R2',client:'M. Benali',address:'5 rue B',city:'Elbeuf',scheduled_at:at(14),status:'terminee',notes:null}]
const show=(path:string)=>render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>)
beforeEach(async()=>{
  fx.role='tech'
  fx.data={interventions:IV,profiles:[{id:'u1',full_name:'Tech Un',role:'tech',referral_code:'ABC123'}],stock_items:[{id:'s1',barcode:'3760000000017',name:'Vanne',qty:4,assigned_to:'u1'}],
    activity:[],pv:[],documents:[{id:'d1',tech_id:'u1',type:'Kbis / avis SIRENE',title:'Mon Kbis',issued_on:null,expires_on:'2030-01-01',file_path:'u1/kbis.pdf'}],
    invoices:[{id:'v1',number:'F-2026-0001',client:'Client X',amount:100,status:'brouillon',created_at:new Date().toISOString()}],billing_profiles:[],referrals:[]}
  await Promise.all(db.tables.map(t=>t.clear()));await db.interventions.bulkPut(IV as any)
  await db.stock.bulkPut(fx.data.stock_items as any)
})
afterEach(cleanup)

describe('app terrain : chaque écran s\'affiche (pas de page vide)',()=>{
  const routes:[string,string][]=[['/','Mes interventions'],['/cal','Calendrier'],['/pv','PV'],['/scan','Scanner'],['/act','Activité'],['/me','Profil']]
  for(const[path,title]of routes)it(`${path} → ${title}`,async()=>{show(path);expect((await screen.findAllByText(title)).length).toBeGreaterThan(0)})
  it('la liste montre les interventions du jour',async()=>{show('/');expect(await screen.findByText('Mme Lefèvre')).toBeTruthy()})
  it('CLIC sur une intervention → l\'écran de détail s\'ouvre',async()=>{
    show('/');fireEvent.click(await screen.findByText('Mme Lefèvre'))
    expect(await screen.findByText('Procès-verbal')).toBeTruthy();expect(screen.getByText("Démarrer l'intervention")).toBeTruthy()})
  it('détail d\'une intervention terminée',async()=>{show('/i/i2');expect(await screen.findByText('Intervention terminée.')).toBeTruthy()})
  it('Valider sans signature → message clair',async()=>{
    show('/i/i1');fireEvent.click(await screen.findByText('Valider le PV'))
    expect(await screen.findByText('La signature du client est obligatoire.')).toBeTruthy()})
  it('Démarrer l\'intervention (hors ligne) → statut En cours + file d\'attente',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    show('/i/i1');fireEvent.click(await screen.findByText("Démarrer l'intervention"))
    await waitFor(async()=>{expect((await db.interventions.get('i1'))!.status).toBe('en_cours')})
    expect(await db.statusops.count()).toBe(1);vi.restoreAllMocks()})
})
