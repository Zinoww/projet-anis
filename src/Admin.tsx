import {useEffect,useState} from 'react'
import {supabase} from './lib/supabase'
import {sync} from './lib/sync'

type Prof={id:string;full_name:string|null;role:string}
type Int={id:string;ref:string|null;client:string;address:string|null;city:string|null;scheduled_at:string;status:string;assigned_to:string|null}
type Stk={id:string;name:string;barcode:string;qty:number;assigned_to:string|null}
const ST:[string,string][]=[['planifiee','Planifiée'],['en_cours','En cours'],['terminee','Terminée'],['a_replanifier','À replanifier']]

function useTable<T>(table:string,order:string,asc=false){
  const[r,setR]=useState<T[]|null>(null),[err,setErr]=useState('')
  const load=()=>{supabase.from(table).select('*').order(order,{ascending:asc}).limit(200).then(x=>{if(x.error)setErr(x.error.message);else setR(x.data as T[])})}
  useEffect(load,[])
  return{r,load,err}
}
const TechSelect=({v,set,techs,blank}:{v:string|null;set:(x:string|null)=>void;techs:Prof[];blank:string})=>
  <select value={v??''} onChange={e=>set(e.target.value||null)}><option value="">{blank}</option>{techs.map(t=><option key={t.id} value={t.id}>{t.full_name??t.id.slice(0,6)}</option>)}</select>

function IntTab({techs}:{techs:Prof[]}){
  const{r,load,err}=useTable<Int>('interventions','scheduled_at')
  const blank={ref:'',client:'',address:'',city:'',date:new Date().toLocaleDateString('sv'),time:'09:00',assigned:null as string|null,notes:''}
  const[f,setF]=useState(blank),[open,setOpen]=useState(false),[msg,setMsg]=useState('')
  const who=(id:string|null)=>techs.find(t=>t.id===id)?.full_name??'Non assignée'
  const refresh=()=>{load();sync()}
  const save=async()=>{setMsg('');if(!f.client.trim())return setMsg('Le client est obligatoire.')
    const{error}=await supabase.from('interventions').insert({ref:f.ref||null,client:f.client,address:f.address||null,city:f.city||null,scheduled_at:new Date(`${f.date}T${f.time}`).toISOString(),assigned_to:f.assigned,notes:f.notes||null})
    if(error)return setMsg(error.message);setF(blank);setOpen(false);refresh()}
  const upd=async(id:string,x:Partial<Int>)=>{const{error}=await supabase.from('interventions').update(x).eq('id',id);if(error)setMsg(error.message);refresh()}
  const del=async(id:string)=>{if(!confirm('Supprimer cette intervention ?'))return;await supabase.from('interventions').delete().eq('id',id);refresh()}
  const inp=(k:'ref'|'client'|'address'|'city'|'notes',l:string)=><label>{l}<input value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></label>
  return <>{!open?<button onClick={()=>setOpen(true)}>+ Nouvelle intervention</button>
    :<div className="card"><h2>Nouvelle intervention</h2>{inp('client','Client')}{inp('ref','Référence')}{inp('address','Adresse')}{inp('city','Ville')}
      <div className="grid2"><label>Date<input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><label>Heure<input type="time" value={f.time} onChange={e=>setF({...f,time:e.target.value})}/></label></div>
      <label>Technicien<TechSelect v={f.assigned} set={x=>setF({...f,assigned:x})} techs={techs} blank="Non assignée"/></label>{inp('notes','Notes')}
      {msg&&<p className="err">{msg}</p>}<button onClick={save}>Créer l'intervention</button><p/><button className="ghost" onClick={()=>setOpen(false)}>Annuler</button></div>}
    {!open&&msg&&<p className="err">{msg}</p>}{err&&<p className="err">{err}</p>}<p/>
    {(r??[]).map(i=><div className="card" key={i.id}>
      <div className="row"><b>{i.client}</b><span className={`chip ${i.status}`}>{ST.find(s=>s[0]===i.status)?.[1]}</span></div>
      <div className="mute">{new Date(i.scheduled_at).toLocaleString('fr',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {[i.address,i.city].filter(Boolean).join(', ')||'Sans adresse'} · {who(i.assigned_to)}</div>
      <div className="grid2"><TechSelect v={i.assigned_to} set={x=>upd(i.id,{assigned_to:x})} techs={techs} blank="Non assignée"/>
        <select value={i.status} onChange={e=>upd(i.id,{status:e.target.value})}>{ST.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
      <button className="ghost" onClick={()=>del(i.id)}>Supprimer</button></div>)}
    {r&&!r.length&&<p className="mute">Aucune intervention. Créez la première.</p>}</>
}

function TeamTab({techs,uid,reload}:{techs:Prof[];uid:string;reload:()=>void}){
  const[msg,setMsg]=useState('')
  const setRole=async(id:string,role:string)=>{const{error}=await supabase.from('profiles').update({role}).eq('id',id);if(error)setMsg(error.message);reload()}
  return <>{msg&&<p className="err">{msg}</p>}{techs.map(t=><div className="card row" key={t.id}><span><b>{t.full_name??t.id.slice(0,8)}</b>{t.id===uid&&<div className="mute">Vous</div>}</span>
    <select style={{width:'auto'}} value={t.role} disabled={t.id===uid} onChange={e=>setRole(t.id,e.target.value)}><option value="tech">Technicien</option><option value="admin">Administrateur</option></select></div>)}
    <p className="mute">Un nouveau membre crée son compte dans l'application, puis apparaît ici.</p></>
}

function StockTab({techs}:{techs:Prof[]}){
  const{r,load,err}=useTable<Stk>('stock_items','name',true)
  const blank={name:'',barcode:'',qty:'',assigned:null as string|null},[f,setF]=useState(blank),[msg,setMsg]=useState('')
  const who=(id:string|null)=>techs.find(t=>t.id===id)?.full_name??'Non assigné'
  const save=async()=>{setMsg('');if(!f.name.trim()||!f.barcode.trim())return setMsg('Nom et code-barres obligatoires.')
    const{error}=await supabase.from('stock_items').insert({name:f.name,barcode:f.barcode.trim(),qty:Math.max(0,Math.floor(+f.qty||0)),assigned_to:f.assigned});if(error)return setMsg(error.message);setF(blank);load();sync()}
  const del=async(id:string)=>{if(!confirm('Supprimer cet article ?'))return;await supabase.from('stock_items').delete().eq('id',id);load();sync()}
  return <><div className="card"><h2>Confier du matériel</h2>
    <label>Nom<input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label><label>Code-barres<input value={f.barcode} onChange={e=>setF({...f,barcode:e.target.value})}/></label>
    <label>Quantité<input inputMode="numeric" value={f.qty} onChange={e=>setF({...f,qty:e.target.value})}/></label>
    <label>Technicien<TechSelect v={f.assigned} set={x=>setF({...f,assigned:x})} techs={techs} blank="Non assigné"/></label>
    {msg&&<p className="err">{msg}</p>}{err&&<p className="err">{err}</p>}<button onClick={save}>Ajouter au stock</button></div>
    {(r??[]).map(s=><div className="card row" key={s.id}><span><b>{s.name}</b><div className="mute">{s.barcode} · {who(s.assigned_to)}</div></span><span><b>{s.qty}</b> <button className="ghost" onClick={()=>del(s.id)}>✕</button></span></div>)}
    {r&&!r.length&&<p className="mute">Aucun article en stock.</p>}</>
}

export default function Admin({uid,admin}:{uid:string;admin:boolean}){
  const[tab,setTab]=useState<'int'|'team'|'stock'>('int'),{r:techs,load}=useTable<Prof>('profiles','full_name',true)
  if(!admin)return <p className="mute" style={{textAlign:'center'}}>Droits insuffisants.</p>
  const T=techs??[]
  return <><div className="tabs">{([['int','Interventions'],['team','Équipe'],['stock','Stock']] as const).map(([k,l])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {tab==='int'&&<IntTab techs={T}/>}{tab==='team'&&<TeamTab techs={T} uid={uid} reload={load}/>}{tab==='stock'&&<StockTab techs={T}/>}</>
}
