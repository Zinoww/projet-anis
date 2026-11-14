import {useEffect,useState} from 'react'
import readXlsxFile from 'read-excel-file'
import {supabase} from './lib/supabase'

type P={start:string;date:string;end:'back'|'last';from:string;until:string;lunch:number;service:number;by:'time'|'dist';title:string}
type Stop={label:string;lat:number;lon:number}
const toMin=(s:string)=>{const[h,m]=s.split(':').map(Number);return(h||0)*60+(m||0)}
const hm=(x:number)=>{const m=Math.round(x);return`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))

async function geocode(q:string):Promise<Stop|null>{
  if(!q.trim())return null
  try{const j=await(await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`)).json()
    const f=j.features?.[0];if(f)return{label:q,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]}}catch{/* repli */}
  try{await sleep(1100);const j=await(await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`)).json()
    if(j[0])return{label:q,lat:+j[0].lat,lon:+j[0].lon}}catch{/* introuvable */}
  return null
}
const hav=(a:Stop,b:Stop)=>{const t=(x:number)=>x*Math.PI/180,h=Math.sin(t(b.lat-a.lat)/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(t(b.lon-a.lon)/2)**2;return 12742*Math.asin(Math.sqrt(h))}
async function matrix(pts:Stop[]){
  try{const j=await(await fetch(`https://router.project-osrm.org/table/v1/driving/${pts.map(p=>`${p.lon},${p.lat}`).join(';')}?annotations=duration,distance`)).json()
    if(j.code!=='Ok')throw new Error('osrm')
    return{d:(j.durations as number[][]).map(r=>r.map(x=>x/60)),k:(j.distances as number[][]).map(r=>r.map(x=>x/1000)),approx:false}
  }catch{const k=pts.map(a=>pts.map(b=>hav(a,b)*1.3));return{d:k.map(r=>r.map(x=>x/50*60)),k,approx:true}}
}
function order(c:number[][],n:number,ret:boolean){
  const left=new Set(Array.from({length:n},(_,i)=>i+1));let o:number[]=[],cur=0
  while(left.size){let b=-1;for(const j of left)if(b<0||c[cur][j]<c[cur][b])b=j;o.push(b);left.delete(b);cur=b}
  const cost=(x:number[])=>{let t=0,p=0;for(const j of x){t+=c[p][j];p=j}return t+(ret?c[p][0]:0)}
  let better=true
  while(better){better=false
    for(let i=0;i<o.length-1;i++)for(let k=i+1;k<o.length;k++){
      const x=[...o.slice(0,i),...o.slice(i,k+1).reverse(),...o.slice(k+1)]
      if(cost(x)<cost(o)-1e-9){o=x;better=true}}}
  return o
}
async function plan(addrs:string[],p:P){
  const s0=await geocode(p.start);if(!s0)throw new Error('Renseignez une adresse de départ valide.')
  const stops:Stop[]=[],bad:string[]=[]
  for(const a of addrs){const g=await geocode(a);if(g)stops.push(g);else bad.push(a)}
  if(!stops.length)throw new Error('Aucune adresse trouvée.')
  const{d,k,approx}=await matrix([s0,...stops])
  const ord=order(p.by==='time'?d:k,stops.length,p.end==='back')
  let t=toMin(p.from),prev=0,lunch=false
  const legs:{label:string;arrive:number;depart:number;km:number;min:number;lunchBefore:boolean}[]=[]
  for(const j of ord){const m=d[prev][j];t+=m;let lb=false
    if(!lunch&&t>=12*60){t+=p.lunch;lunch=true;lb=true}
    legs.push({label:stops[j-1].label,arrive:t,depart:t+p.service,km:k[prev][j],min:m,lunchBefore:lb});t+=p.service;prev=j}
  let bk=0,bm=0;if(p.end==='back'){bk=k[prev][0];bm=d[prev][0];t+=bm}
  return{legs,bad,approx,end:t,km:legs.reduce((a,l)=>a+l.km,0)+bk,over:t>toMin(p.until)}
}
export {order,plan,toMin,hm}
type Res=Awaited<ReturnType<typeof plan>>

const ls=()=>{try{return localStorage.getItem('startAddr')??''}catch{return''}}
function usePlan():[P,(x:Partial<P>)=>void]{
  const[p,setP]=useState<P>(()=>({start:ls(),date:new Date().toLocaleDateString('sv'),end:'back',from:'08:00',until:'18:00',lunch:60,service:30,by:'time',title:'Tournée optimisée'}))
  return[p,x=>{setP(o=>({...o,...x}));if(x.start!==undefined)try{localStorage.setItem('startAddr',x.start)}catch{/* ignore */}}]
}

function Params({p,set,date}:{p:P;set:(x:Partial<P>)=>void;date:boolean}){
  return <>
    <label>Adresse de départ<input value={p.start} onChange={e=>set({start:e.target.value})} placeholder="Ex. : 12 rue de la Paix, 76000 Rouen"/></label>
    {date&&<label>Date<input type="date" value={p.date} onChange={e=>set({date:e.target.value})}/></label>}
    <label>Fin de tournée<select value={p.end} onChange={e=>set({end:e.target.value as P['end']})}><option value="back">Retour au point de départ</option><option value="last">Au dernier arrêt</option></select></label>
    <label>Heure de départ<input type="time" value={p.from} onChange={e=>set({from:e.target.value})}/></label>
    <label>Fin de journée au plus tard<input type="time" value={p.until} onChange={e=>set({until:e.target.value})}/></label>
    <label>Pause déjeuner (min)<input inputMode="numeric" value={p.lunch} onChange={e=>set({lunch:+e.target.value||0})}/></label>
    <label>Temps sur place par défaut (min)<input inputMode="numeric" value={p.service} onChange={e=>set({service:+e.target.value||0})}/></label>
    <label>Optimiser<select value={p.by} onChange={e=>set({by:e.target.value as P['by']})}><option value="time">le temps de trajet</option><option value="dist">la distance</option></select></label>
    <label>Titre<input value={p.title} onChange={e=>set({title:e.target.value})}/></label></>
}

function Result({r,p}:{r:Res;p:P}){
  const enc=encodeURIComponent,names=r.legs.map(l=>l.label),dest=p.end==='back'?p.start:names[names.length-1],way=p.end==='back'?names:names.slice(0,-1)
  const url=`https://www.google.com/maps/dir/?api=1&origin=${enc(p.start)}&destination=${enc(dest)}${way.length?`&waypoints=${enc(way.join('|'))}`:''}&travelmode=driving`
  return <div className="card"><h2>{p.title}</h2>
    <div className="grid2"><div className="card"><div className="mute">Distance</div><b style={{fontSize:'1.4rem'}}>{r.km.toFixed(1)} km</b></div><div className="card"><div className="mute">Fin estimée</div><b style={{fontSize:'1.4rem'}}>{hm(r.end)}</b></div></div>
    {r.over&&<p className="err">La tournée dépasse l'heure de fin de journée ({p.until}).</p>}
    {r.approx&&<p className="mute">Le calcul d'itinéraire n'a pas répondu : durées estimées à vol d'oiseau.</p>}
    {r.bad.length>0&&<p className="err">Adresses introuvables : {r.bad.join(' ; ')}</p>}
    {r.legs.map((l,i)=><div className="card" key={i}><div className="row"><b>{i+1}. {l.label}</b><span className="chip">{hm(l.arrive)}</span></div>
      <div className="mute">{l.lunchBefore?'Pause déjeuner avant · ':''}{l.km.toFixed(1)} km · {Math.round(l.min)} min de route · départ {hm(l.depart)}</div></div>)}
    <a className="btn" href={url} target="_blank" rel="noreferrer">Ouvrir l'itinéraire dans Google Maps</a></div>
}

export function Tournees({uid}:{uid:string}){
  const[p,set]=usePlan(),[techs,setTechs]=useState<{id:string;full_name:string|null}[]>([]),[tech,setTech]=useState(uid)
  const[res,setRes]=useState<Res|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('')
  useEffect(()=>{supabase.from('profiles').select('id,full_name').then(r=>setTechs(r.data??[]))},[])
  const go=async()=>{setErr('');setRes(null);setBusy(true)
    try{const a=new Date(p.date+'T00:00:00'),b=new Date(p.date+'T23:59:59')
      const{data,error}=await supabase.from('interventions').select('address,city').eq('assigned_to',tech).gte('scheduled_at',a.toISOString()).lte('scheduled_at',b.toISOString()).neq('status','terminee')
      if(error)throw error
      const addrs=(data??[]).map(i=>[i.address,i.city].filter(Boolean).join(', ')).filter(Boolean)
      if(!addrs.length)throw new Error('Aucune intervention avec adresse ce jour-là.')
      setRes(await plan(addrs,p))
    }catch(e:any){setErr(e.message??'Erreur')}finally{setBusy(false)}}
  return <><div className="card"><h2>Tournée optimisée</h2>
    <label>Intervenant<select value={tech} onChange={e=>setTech(e.target.value)}>{techs.map(t=><option key={t.id} value={t.id}>{t.full_name??t.id}</option>)}</select></label>
    <label>Date<input type="date" value={p.date} onChange={e=>set({date:e.target.value})}/></label>
    <details><summary>Paramètres de la tournée</summary><Params p={p} set={set} date={false}/></details>
    {!p.start&&<p className="mute">Ouvrez les paramètres pour renseigner l'adresse de départ.</p>}
    {err&&<p className="err">{err}</p>}<button onClick={go} disabled={busy}>{busy?'Calcul en cours…':'Calculer la tournée'}</button></div>
    {res&&<Result r={res} p={p}/>}</>
}

export function Optimiseur(){
  const[p,set]=usePlan(),[text,setText]=useState(''),[res,setRes]=useState<Res|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('')
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean)
  const onFile=async(f?:File)=>{if(!f)return;setErr('')
    try{const l=/\.xlsx$/i.test(f.name)?(await readXlsxFile(f)).map(r=>r.filter(c=>c!=null&&c!=='').join(', ')):(await f.text()).split(/\r?\n/).map(x=>x.replace(/[;\t]/g,', ').trim())
      setText(l.filter(x=>/\d/.test(x)).join('\n'))}catch{setErr('Fichier illisible. Utilisez un .xlsx, un .csv ou un .txt.')}}
  const go=async()=>{setErr('');setRes(null);setBusy(true)
    try{if(!lines.length)throw new Error('Ajoutez au moins une adresse.');setRes(await plan(lines,p))}
    catch(e:any){setErr(e.message??'Erreur')}finally{setBusy(false)}}
  return <><div className="card"><h2>1. Point de départ, jours et horaires</h2><Params p={p} set={set} date/></div>
    <div className="card"><h2>2. Arrêts à visiter</h2>
      <label>Importer un fichier Excel (.xlsx) ou CSV<input type="file" accept=".xlsx,.csv,.txt" onChange={e=>onFile(e.target.files?.[0])}/></label>
      <label>Ou coller les adresses (une par ligne)<textarea rows={6} value={text} onChange={e=>setText(e.target.value)} placeholder={'10 rue Jeanne d’Arc, Rouen\n5 avenue de la Gare, Elbeuf'}/></label>
      <p className="mute">{lines.length} arrêt(s)</p>{err&&<p className="err">{err}</p>}
      <button onClick={go} disabled={busy}>{busy?'Calcul en cours…':'Optimiser la tournée'}</button></div>
    {res&&<Result r={res} p={p}/>}</>
}
