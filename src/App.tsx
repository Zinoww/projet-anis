import {useEffect,useRef,useState} from 'react'
import {NavLink,Route,Routes,Navigate,Link,useLocation,useNavigate,useParams} from 'react-router-dom'
import {useLiveQuery} from 'dexie-react-hooks'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './lib/supabase'
import {db,type Intervention} from './lib/db'
import {sync,compress} from './lib/sync'
import {Scanner,Activity,PVs} from './Extra'
import Main from './AppMain'

const day=(s:string)=>new Date(s).toLocaleDateString('sv')
const label:Record<string,string>={planifiee:'Planifiée',en_cours:'En cours',terminee:'Terminée',a_replanifier:'À replanifier'}
export const Chip=({s}:{s:string})=><span className={`chip ${s}`}>{label[s]}</span>

function Login(){
  const[email,setE]=useState(''),[pw,setP]=useState(''),[err,setErr]=useState('')
  const go=async(up:boolean)=>{setErr('');const f=up?supabase.auth.signUp:supabase.auth.signInWithPassword
    const{error}=await f.call(supabase.auth,{email,password:pw});if(error)setErr(error.message)}
  return <main><h1>Terrain</h1>
    <label>E-mail<input type="email" value={email} onChange={e=>setE(e.target.value)} autoComplete="email"/></label>
    <label>Mot de passe<input type="password" value={pw} onChange={e=>setP(e.target.value)} autoComplete="current-password"/></label>
    {err&&<p className="err">{err}</p>}
    <button onClick={()=>go(false)}>Se connecter</button><p/>
    <button className="ghost" onClick={()=>go(true)}>Créer un compte</button></main>
}

export function Item({i}:{i:Intervention}){
  return <Link className="card" to={`/i/${i.id}`}><div className="row"><b>{i.client}</b><Chip s={i.status}/></div>
    <div className="mute">{new Date(i.scheduled_at).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'})} · {[i.address,i.city].filter(Boolean).join(', ')}</div></Link>
}

function List(){
  const all=useLiveQuery(()=>db.interventions.orderBy('scheduled_at').toArray(),[])??[]
  const[tab,setTab]=useState<'today'|'next'|'done'>('today'),[q,setQ]=useState('')
  const t=day(new Date().toISOString())
  const rows=all.filter(i=>{const d=day(i.scheduled_at),done=i.status==='terminee'
    const ok=tab==='done'?done:tab==='today'?d===t&&!done:d>t&&!done
    return ok&&`${i.client} ${i.city} ${i.ref}`.toLowerCase().includes(q.toLowerCase())})
  return <main><h1>Mes interventions</h1>
    <input placeholder="Rechercher : client, ville, référence" value={q} onChange={e=>setQ(e.target.value)}/>
    <div className="tabs">{(['today','next','done'] as const).map(k=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{{today:"Aujourd'hui",next:'À venir',done:'Terminées'}[k]}</button>)}</div>
    {rows.length?rows.map(i=><Item key={i.id} i={i}/>):<p className="mute">Aucune intervention ici.</p>}</main>
}

export function Calendar({status}:{status?:string}={}){
  const all=(useLiveQuery(()=>db.interventions.toArray(),[])??[]).filter(i=>!status||i.status===status)
  const[m,setM]=useState(()=>{const d=new Date();d.setDate(1);return d}),[sel,setSel]=useState(day(new Date().toISOString()))
  const first=(m.getDay()+6)%7,n=new Date(m.getFullYear(),m.getMonth()+1,0).getDate()
  const key=(d:number)=>day(new Date(m.getFullYear(),m.getMonth(),d,12).toISOString())
  const by=new Map<string,Set<string>>();all.forEach(i=>{const d=day(i.scheduled_at);by.set(d,(by.get(d)??new Set()).add(i.status))})
  const act=new Set((useLiveQuery(()=>db.activity.toArray(),[])??[]).map(a=>a.day))
  const mv=(k:number)=>setM(new Date(m.getFullYear(),m.getMonth()+k,1))
  return <main><h1>Calendrier</h1><div className="row"><button className="ghost" onClick={()=>mv(-1)}>‹</button>
    <b>{m.toLocaleDateString('fr',{month:'long',year:'numeric'})}</b><button className="ghost" onClick={()=>mv(1)}>›</button></div><p/>
    <div className="cal">{['L','M','M','J','V','S','D'].map((d,i)=><b key={i}>{d}</b>)}
      {Array.from({length:first}).map((_,i)=><span key={'e'+i}/>)}
      {Array.from({length:n},(_,i)=>i+1).map(d=><button key={d} className={`day ${key(d)===sel?'sel':''}`} onClick={()=>setSel(key(d))}>{d}<span className="dots">{[...(by.get(key(d))??[])].map(s=><i key={s} className={s}/>)}</span>{act.has(key(d))&&<u/>}</button>)}</div>
    <div className="legend">{[['planifiee','Planifiée'],['en_cours','En cours'],['terminee','Terminée'],['a_replanifier','À replanifier']].map(([k,l])=><span key={k}><i className={k}/>{l}</span>)}<span><u/>Activité déclarée</span></div>
    <h2>{new Date(sel+'T12:00').toLocaleDateString('fr',{weekday:'long',day:'numeric',month:'long'})}</h2>
    {all.filter(i=>day(i.scheduled_at)===sel).map(i=><Item key={i.id} i={i}/>)}
    {!all.some(i=>day(i.scheduled_at)===sel)&&<p className="mute">Rien de prévu ce jour-là.</p>}</main>
}

function Sign({onChange}:{onChange:(d:string|null)=>void}){
  const ref=useRef<HTMLCanvasElement>(null),on=useRef(false)
  const ctx=()=>ref.current!.getContext('2d')!
  const pos=(e:React.PointerEvent)=>{const c=ref.current!,r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]}
  return <div><canvas ref={ref} width={600} height={300} className="sign" style={{touchAction:'none'}}
    onPointerDown={e=>{on.current=true;const[x,y]=pos(e);ctx().beginPath();ctx().moveTo(x,y);ref.current!.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{if(!on.current)return;const[x,y]=pos(e),c=ctx();c.lineWidth=4;c.lineCap='round';c.strokeStyle='#14232b';c.lineTo(x,y);c.stroke()}}
    onPointerUp={()=>{on.current=false;onChange(ref.current!.toDataURL('image/png'))}}/>
    <button type="button" className="ghost" onClick={()=>{ctx().clearRect(0,0,600,300);onChange(null)}}>Effacer la signature</button></div>
}

function Detail({uid}:{uid:string}){
  const{id}=useParams(),nav=useNavigate()
  const it=useLiveQuery(()=>db.interventions.get(id!),[id])
  const pending=useLiveQuery(()=>db.outbox.where('intervention_id').equals(id!).count(),[id])
  const[outcome,setO]=useState<'ok'|'ko'>('ok'),[work,setW]=useState(''),[photos,setPh]=useState<Blob[]>([]),[sig,setSig]=useState<string|null>(null)
  const[t0]=useState(()=>new Date().toISOString()),[err,setErr]=useState('')
  if(!it)return <main><p className="mute">Chargement…</p></main>
  const add=async(f:FileList|null)=>{if(f)setPh([...photos,...await Promise.all([...f].map(x=>compress(x)))])}
  const save=async()=>{
    if(!sig)return setErr('La signature du client est obligatoire.')
    await db.outbox.put({id:crypto.randomUUID(),intervention_id:it.id,tech_id:uid,outcome,work_done:work,started_at:t0,ended_at:new Date().toISOString(),signature:sig,photos})
    await db.interventions.update(it.id,{status:outcome==='ok'?'terminee':'a_replanifier'})
    sync();nav('/')}
  const start=async()=>{await db.interventions.update(it.id,{status:'en_cours'});await db.statusops.add({intervention_id:it.id,status:'en_cours'});sync()}
  return <main><button className="ghost" onClick={()=>nav(-1)}>‹ Retour</button><h1>{it.client}</h1>
    <p className="mute">{[it.address,it.city].filter(Boolean).join(', ')}</p><Chip s={it.status}/>{it.notes&&<p>{it.notes}</p>}
    {pending?<p className="mute">PV enregistré, en attente de réseau.</p>:it.status==='terminee'?<p className="mute">Intervention terminée.</p>:<>
      {it.status==='planifiee'&&<><p/><button onClick={start}>Démarrer l'intervention</button></>}
      <h2>Procès-verbal</h2>
      <select value={outcome} onChange={e=>setO(e.target.value as 'ok'|'ko')}><option value="ok">Intervention réussie</option><option value="ko">Impossible, à replanifier</option></select>
      <textarea rows={4} placeholder="Travaux réalisés, remarques…" value={work} onChange={e=>setW(e.target.value)}/>
      <input type="file" accept="image/*" capture="environment" multiple onChange={e=>add(e.target.files)}/>
      <div className="photos">{photos.map((b,i)=><img key={i} src={URL.createObjectURL(b)} alt={`Photo ${i+1}`}/>)}</div>
      <h2>Signature du client</h2><Sign onChange={setSig}/>
      {err&&<p className="err">{err}</p>}<p/><button onClick={save}>Valider le PV</button></>}</main>
}

function Profile({s}:{s:Session}){
  const n=useLiveQuery(()=>db.outbox.count(),[])??0,[msg,setMsg]=useState('')
  return <main><h1>Profil</h1><div className="card"><b>{s.user.email}</b><div className="mute">{n} PV à envoyer</div></div>
    <button onClick={async()=>setMsg((await sync())??'Synchronisé.')}>Synchroniser maintenant</button><p className="mute">{msg}</p><Link className="btn" to="/m">Ouvrir l'application principale</Link><p/>
    <button className="ghost" onClick={()=>supabase.auth.signOut()}>Se déconnecter</button></main>
}

export default function App(){
  const[s,setS]=useState<Session|null|undefined>(undefined),[online,setOn]=useState(navigator.onLine)
  const inMain=useLocation().pathname.startsWith('/m')
  useEffect(()=>{supabase.auth.getSession().then(r=>setS(r.data.session))
    const{data}=supabase.auth.onAuthStateChange((_,x)=>setS(x));return()=>data.subscription.unsubscribe()},[])
  useEffect(()=>{if(!s)return;sync();const f=()=>{setOn(navigator.onLine);sync()}
    addEventListener('online',f);addEventListener('offline',f);const t=setInterval(sync,60000)
    return()=>{removeEventListener('online',f);removeEventListener('offline',f);clearInterval(t)}},[s])
  if(s===undefined)return null
  if(!s)return <Login/>
  return <>{!online&&<div className="banner">Hors ligne : vos PV seront envoyés au retour du réseau</div>}
    <Routes><Route path="/" element={<List/>}/><Route path="/pv" element={<PVs/>}/><Route path="/cal" element={<Calendar/>}/><Route path="/m/*" element={<Main s={s}/>}/><Route path="/i/:id" element={<Detail uid={s.user.id}/>}/><Route path="/scan" element={<Scanner/>}/><Route path="/act" element={<Activity/>}/><Route path="/me" element={<Profile s={s}/>}/><Route path="*" element={<Navigate to="/"/>}/></Routes>
    {!inMain&&<nav className="nav"><NavLink to="/" end>Interventions</NavLink><NavLink to="/pv">PV</NavLink><NavLink to="/cal">Calendrier</NavLink><NavLink to="/scan">Scanner</NavLink><NavLink to="/act">Activité</NavLink><NavLink to="/me">Profil</NavLink></nav>}</>
}
