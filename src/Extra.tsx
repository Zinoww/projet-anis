import {useEffect,useRef,useState} from 'react'
import {useLiveQuery} from 'dexie-react-hooks'
import {Link} from 'react-router-dom'
import {db} from './lib/db'
import {sync} from './lib/sync'

export function Scanner(){
  const stock=useLiveQuery(()=>db.stock.toArray(),[])??[]
  const[code,setCode]=useState(''),[cam,setCam]=useState(false),[status,setStatus]=useState(''),[err,setErr]=useState(''),[note,setNote]=useState(''),[done,setDone]=useState(false)
  const vid=useRef<HTMLVideoElement>(null)
  useEffect(()=>{
    if(!cam)return
    let controls:{stop:()=>void}|undefined,dead=false
    setErr('');setStatus('Démarrage de la caméra…')
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setErr('La caméra exige une adresse HTTPS (ou localhost). Saisissez la référence à la main.');setCam(false);return}
    ;(async()=>{try{
      const[{BrowserMultiFormatReader},{BarcodeFormat,DecodeHintType}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')])
      const hints=new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.UPC_A,BarcodeFormat.UPC_E,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39,BarcodeFormat.QR_CODE,BarcodeFormat.DATA_MATRIX])
      hints.set(DecodeHintType.TRY_HARDER,true)
      const reader=new BrowserMultiFormatReader(hints)
      const c=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}}},vid.current!,r=>{
        if(r&&!dead){dead=true;navigator.vibrate?.(80);setCode(r.getText());setDone(true);setCam(false)}})
      controls=c;if(dead)c.stop();else setStatus('Placez le code dans le cadre')
    }catch(e:any){setErr(e?.name==='NotAllowedError'?'Caméra refusée : autorisez-la dans les réglages du navigateur.':e?.name==='NotFoundError'?'Aucune caméra détectée.':'Caméra indisponible : saisissez la référence.');setCam(false)}})()
    return()=>{dead=true;controls?.stop()}
  },[cam])
  const k=code.trim().toLowerCase()
  const hit=k?stock.find(s=>s.barcode.toLowerCase()===k||s.name.toLowerCase()===k):undefined
  const use=async()=>{if(!hit||hit.qty<1)return
    await db.stock.update(hit.id,{qty:hit.qty-1});await db.stockops.add({item_id:hit.id,n:1});setNote('1 unité utilisée.');sync()}
  const refresh=async()=>{if(!navigator.onLine)return setNote('Hors ligne : impossible d\'actualiser.')
    const e=await sync();setNote(e?`Erreur de synchronisation : ${e}`:'Stock à jour.')}
  return <main><h1>Scanner</h1>
    {cam?<><div className="scan"><video ref={vid} autoPlay muted playsInline/><div className="frame"/><div className="line"/></div>
      <p className="mute">{status}</p><button className="ghost" onClick={()=>setCam(false)}>Arrêter</button></>
      :<button onClick={()=>{setErr('');setNote('');setCam(true)}}>{done?'Scanner à nouveau':'Scanner un code-barres'}</button>}
    {err&&<p className="err">{err}</p>}<p/>
    <input placeholder="ou saisir code-barres / nom" value={code} onChange={e=>{setCode(e.target.value);setDone(false)}}/>
    {k&&<div className="card"><div className="mute">{done?'Code détecté':'Code saisi'}</div><b>{code}</b>
      {hit?<><div className="row"><span>{hit.name}</span><b>{hit.qty} en stock</b></div><p/><button onClick={use} disabled={hit.qty<1}>Utiliser 1 unité</button></>
        :<p className="err">Aucun article confié ne correspond à ce code.</p>}</div>}
    {note&&<p className={note.startsWith('Erreur')?'err':'mute'}>{note}</p>}
    <div className="row"><h2>Mon stock ({stock.length})</h2><button className="ghost" onClick={refresh}>Actualiser</button></div>
    {stock.map(s=><div className="card row" key={s.id}><span>{s.name}<div className="mute">{s.barcode}</div></span><b>{s.qty}</b></div>)}
    {!stock.length&&<p className="mute">Aucun matériel confié. Ajoutez un article dans Plus &gt; Administration &gt; Stock, assigné à votre compte, puis touchez Actualiser.</p>}</main>
}

export function Activity(){
  const all=useLiveQuery(()=>db.activity.orderBy('day').reverse().toArray(),[])??[]
  const today=new Date().toLocaleDateString('sv'),mois=all.filter(a=>a.day.startsWith(today.slice(0,7)))
  const[f,setF]=useState({hours:'',km:'',fees:''})
  const sum=(k:'hours'|'km'|'fees')=>mois.reduce((t,a)=>t+a[k],0)
  const save=async()=>{await db.activity.put({day:today,hours:+f.hours||0,km:+f.km||0,fees:+f.fees||0,synced:0});sync()}
  const fld=(k:'hours'|'km'|'fees',l:string)=><label>{l}<input inputMode="decimal" value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></label>
  return <main><h1>Activité</h1>
    <div className="card row"><span><b>{mois.length}</b> jour(s)</span><span><b>{sum('hours')}</b> h</span><span><b>{sum('km')}</b> km</span><span><b>{sum('fees')}</b> €</span></div>
    <h2>Déclarer ma journée d'aujourd'hui</h2>{fld('hours','Heures travaillées')}{fld('km','Kilomètres')}{fld('fees','Frais (€)')}
    <button onClick={save}>Enregistrer</button>
    <h2>Historique</h2>{all.slice(0,10).map(a=><div className="card row" key={a.day}><span>{new Date(a.day+'T12:00').toLocaleDateString('fr',{weekday:'short',day:'numeric',month:'short'})}</span><span className="mute">{a.hours} h · {a.km} km · {a.fees} €</span><span className="chip">{a.synced?'Envoyée':'En attente'}</span></div>)}</main>
}

export function PVs(){
  const ints=useLiveQuery(()=>db.interventions.toArray(),[])??[]
  const out=useLiveQuery(()=>db.outbox.toArray(),[])??[]
  const done=useLiveQuery(()=>db.pvs.orderBy('ended_at').reverse().toArray(),[])??[]
  const row=(id:string,iid:string,outcome:string,at:string,n:number,sent:boolean)=>{
    const it=ints.find(i=>i.id===iid)
    return <Link className="card" key={id} to={`/i/${iid}`}><div className="row"><b>{it?.client??'Intervention'}</b>
      <span className={`chip ${outcome==='ok'?'terminee':'a_replanifier'}`}>{outcome==='ok'?'OK':'KO'}</span></div>
      <div className="mute">{new Date(at).toLocaleString('fr',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {n} photo(s) · {sent?'Envoyé':'À envoyer'}</div></Link>}
  return <main><h1>PV</h1>
    <div className="card row"><span><b>{out.length}</b> à envoyer</span><span><b>{done.length}</b> envoyés</span></div>
    {out.length>0&&<><h2>À envoyer</h2>{out.map(p=>row(p.id,p.intervention_id,p.outcome,p.ended_at,p.photos.length,false))}</>}
    {done.length>0&&<><h2>Envoyés</h2>{done.map(p=>row(p.id,p.intervention_id,p.outcome,p.ended_at,p.photo_paths.length,true))}</>}
    {!out.length&&!done.length&&<p className="mute">Aucun PV pour le moment. Ouvrez une intervention pour en créer un.</p>}</main>
}
