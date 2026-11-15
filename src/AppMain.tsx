import {useEffect,useState,type ReactNode} from 'react'
import {NavLink,Route,Routes,Link,useLocation} from 'react-router-dom'
import {useLiveQuery} from 'dexie-react-hooks'
import QRCode from 'qrcode'
import type {Session} from '@supabase/supabase-js'
import {supabase} from './lib/supabase'
import {db} from './lib/db'
import {sync} from './lib/sync'
import {openStored} from './lib/storage'
import {getPrefs,setPrefs,type Prefs} from './prefs'
import {Item,Calendar} from './App'
import {Tournees,Optimiseur} from './Route'
import Admin from './Admin'

const eur=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n)
const day=(s:string)=>new Date(s).toLocaleDateString('sv')
const ST=[['planifiee','Planifiée'],['en_cours','En cours'],['terminee','Terminée'],['a_replanifier','À replanifier']]
const TITLES:Record<string,string>={'':"Vue d'ensemble",interventions:'Interventions',planning:'Planning',tournees:'Tournées et affectation',inventaire:'Mon inventaire et installations',materiel:'Matériel confié',documents:'Documents administratifs',factures:'Mes factures',apporteur:'Mon lien apporteur',optimiseur:'Optimiseur de tournée',admin:'Administration'}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  return <div className="modal" role="dialog" aria-label={title}><div className="mbody"><div className="row"><h2>{title}</h2><button className="ghost" onClick={onClose} aria-label="Fermer">✕</button></div>{children}</div></div>
}
function useRows<T>(table:string,order='created_at'){
  const[r,setR]=useState<T[]|null>(null)
  const load=()=>{supabase.from(table).select('*').order(order,{ascending:false}).then(x=>setR((x.data as T[])??[]))}
  useEffect(load,[])
  return[r,load] as const
}
const useAll=()=>useLiveQuery(()=>db.interventions.orderBy('scheduled_at').toArray(),[])??[]

function Home(){
  const all=useAll(),t=day(new Date().toISOString()),lim=day(new Date(Date.now()+7*864e5).toISOString())
  const today=all.filter(i=>day(i.scheduled_at)===t),next=all.filter(i=>{const d=day(i.scheduled_at);return d>t&&d<=lim})
  const late=all.filter(i=>day(i.scheduled_at)<t&&i.status!=='terminee'),open=all.filter(i=>i.status!=='terminee')
  const stat=(l:string,n:number,sub:string)=><div className="card"><div className="mute">{l}</div><b style={{fontSize:'2rem'}}>{n}</b><div className="mute">{sub}</div></div>
  return <><div className="card"><b>Application terrain</b><p className="mute">Vos interventions du jour, pointage, photos, matériel et signature client, même sans réseau.</p><Link className="btn" to="/">Ouvrir l'application</Link></div>
    <div className="grid2">{stat("Aujourd'hui",today.length,'intervention(s) prévue(s)')}{stat('7 prochains jours',next.length,'à venir')}{stat('En retard',late.length,'non clôturée(s)')}{stat('Ouvertes',open.length,`sur ${all.length} au total`)}</div>
    <div className="row"><h2>Aujourd'hui</h2><Link to="/m/interventions">Toutes →</Link></div>
    {today.length?today.map(i=><Item key={i.id} i={i}/>):<p className="mute">Aucune intervention prévue aujourd'hui.</p>}</>
}

function Interventions(){
  const all=useAll(),[q,setQ]=useState(''),[st,setSt]=useState(''),[city,setCity]=useState('')
  const rows=all.filter(i=>(!st||i.status===st)&&(!city||(i.city??'').toLowerCase().includes(city.toLowerCase()))&&`${i.client} ${i.city} ${i.ref} ${i.address}`.toLowerCase().includes(q.toLowerCase()))
  return <div className="card"><h2>Suivi des interventions</h2><input placeholder="Rechercher…" value={q} onChange={e=>setQ(e.target.value)}/>
    <details><summary>Filtres par colonne · {rows.length} élément(s)</summary>
      <select value={st} onChange={e=>setSt(e.target.value)}><option value="">Tous les statuts</option>{ST.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
      <input placeholder="Ville" value={city} onChange={e=>setCity(e.target.value)}/></details>
    {rows.map(i=><Item key={i.id} i={i}/>)}{!rows.length&&<p className="mute">Aucune intervention à afficher.</p>}</div>
}

function Planning(){
  const all=useAll(),[st,setSt]=useState(''),t=day(new Date().toISOString()),lim=day(new Date(Date.now()+7*864e5).toISOString())
  const today=all.filter(i=>day(i.scheduled_at)===t),next=all.filter(i=>{const d=day(i.scheduled_at);return d>t&&d<=lim})
  return <><div className="card"><div className="row"><h2>Aujourd'hui · {t}</h2><span className="mute">{today.length} intervention(s)</span></div>
      {today.map(i=><Item key={i.id} i={i}/>)}{!today.length&&<p className="mute">Rien de prévu aujourd'hui.</p>}</div>
    <div className="card"><div className="row"><h2>Les 7 prochains jours</h2><span className="mute">{next.length} à venir</span></div>
      {next.map(i=><Item key={i.id} i={i}/>)}{!next.length&&<p className="mute">Aucune intervention dans les 7 jours.</p>}</div>
    <div className="card"><label>Statut<select value={st} onChange={e=>setSt(e.target.value)}><option value="">Tous</option>{ST.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
      <Calendar status={st||undefined}/></div></>
}

function Materiel(){
  const stock=useLiveQuery(()=>db.stock.toArray(),[])??[]
  return <div className="card"><h2>Mon matériel</h2>{stock.map(s=><div className="row" key={s.id}><span>{s.name}<div className="mute">{s.barcode}</div></span><b>{s.qty}</b></div>)}
    {!stock.length&&<p className="mute">Aucun matériel confié.</p>}</div>
}

function Inventaire({admin}:{admin:boolean}){
  const[r]=useRows<{id:string;name:string;barcode:string;qty:number}>('stock_items','name')
  if(!admin)return <p className="mute" style={{textAlign:'center'}}>Droits insuffisants.</p>
  return <div className="card"><h2>Inventaire de l'équipe</h2>{(r??[]).map(s=><div className="row" key={s.id}><span>{s.name}<div className="mute">{s.barcode}</div></span><b>{s.qty}</b></div>)}
    {r&&!r.length&&<p className="mute">Aucun article.</p>}</div>
}

type Doc={id:string;type:string;title:string;issued_on:string|null;expires_on:string|null;file_path:string}
const TYPES=['Kbis / avis SIRENE','Attestation URSSAF','Assurance décennale','Attestation RGE','Pièce d’identité','Autre']
function Documents({uid}:{uid:string}){
  const[rows,load]=useRows<Doc>('documents'),[open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[err,setErr]=useState('')
  const empty={type:TYPES[0],title:'',issued:'',expires:''},[f,setF]=useState(empty)
  const save=async()=>{setErr('');if(!file)return setErr('Choisissez un fichier (PDF, PNG ou JPG).')
    const path=`${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g,'_')}`
    const up=await supabase.storage.from('documents').upload(path,file);if(up.error)return setErr(up.error.message)
    const ins=await supabase.from('documents').insert({tech_id:uid,type:f.type,title:f.title||f.type,issued_on:f.issued||null,expires_on:f.expires||null,file_path:path});if(ins.error)return setErr(ins.error.message)
    setOpen(false);setFile(null);setF(empty);load()}
  const[vmsg,setVmsg]=useState('')
  const view=async(p:string)=>setVmsg(await openStored('documents',p))
  const today=day(new Date().toISOString())
  return <div className="card"><div className="row"><h2>Mes documents</h2><button style={{width:'auto'}} onClick={()=>setOpen(true)}>+ Ajouter un document</button></div>
    {vmsg&&<p className="err">{vmsg}</p>}{(rows??[]).map(d=><div className="row card" key={d.id}><span><b>{d.title}</b><div className="mute">{d.type}{d.expires_on?` · expire le ${d.expires_on}`:''}</div></span>
      <span>{d.expires_on&&d.expires_on<today&&<span className="chip a_replanifier">Expiré</span>} <button className="ghost" onClick={()=>view(d.file_path)}>Ouvrir</button></span></div>)}
    {rows&&!rows.length&&<p className="mute">Aucun document enregistré.</p>}
    {open&&<Modal title="Ajouter un document" onClose={()=>setOpen(false)}>
      <label>Type<select value={f.type} onChange={e=>setF({...f,type:e.target.value})}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Intitulé<input value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></label>
      <label>Date d'émission<input type="date" value={f.issued} onChange={e=>setF({...f,issued:e.target.value})}/></label>
      <label>Date d'expiration<input type="date" value={f.expires} onChange={e=>setF({...f,expires:e.target.value})}/></label>
      <label>Fichier (PDF, PNG, JPG)<input type="file" accept=".pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
      {err&&<p className="err">{err}</p>}<button onClick={save}>Enregistrer</button></Modal>}</div>
}

type Bill={company_name:string;siret:string;vat:string;address:string;iban:string;bic:string}
type Inv={id:string;number:string;client:string;amount:number;status:string;created_at:string}
function Factures({uid,name}:{uid:string;name:string}){
  const blank:Bill={company_name:name,siret:'',vat:'',address:'',iban:'',bic:''}
  const[bp,setBp]=useState<Bill>(blank),[edit,setEdit]=useState(false),[inv,loadI]=useRows<Inv>('invoices'),[nf,setNf]=useState(false),[f,setF]=useState({client:'',amount:''}),[err,setErr]=useState('')
  const loadB=()=>{supabase.from('billing_profiles').select('company_name,siret,vat,address,iban,bic').eq('tech_id',uid).maybeSingle().then(r=>{if(r.data)setBp({...blank,...Object.fromEntries(Object.entries(r.data).map(([k,v])=>[k,v??'']))})})}
  useEffect(loadB,[])
  const saveB=async()=>{const{error}=await supabase.from('billing_profiles').upsert({...bp,tech_id:uid});if(error)return setErr(error.message);setErr('');setEdit(false)}
  const missing=[!bp.siret&&'SIRET',!bp.address&&'adresse',!bp.iban&&'IBAN'].filter(Boolean)
  const addInv=async()=>{const n=`F-${new Date().getFullYear()}-${String((inv?.length??0)+1).padStart(4,'0')}`
    const{error}=await supabase.from('invoices').insert({tech_id:uid,number:n,client:f.client,amount:+f.amount||0});if(error)return setErr(error.message)
    setErr('');setNf(false);setF({client:'',amount:''});loadI()}
  const pdf=async(i:Inv)=>{const{jsPDF}=await import('jspdf');const d=new jsPDF();let y=20
    const line=(t:string,size=11,bold=false)=>{d.setFontSize(size);d.setFont('helvetica',bold?'bold':'normal');d.text(t,20,y);y+=size*0.6+3}
    line('FACTURE '+i.number,18,true);y+=4;line(`Date : ${new Date(i.created_at).toLocaleDateString('fr')}`)
    y+=6;line('Émetteur',12,true);[bp.company_name,bp.address,bp.siret&&`SIRET : ${bp.siret}`,bp.vat&&`N° TVA : ${bp.vat}`,bp.iban&&`IBAN : ${bp.iban}`,bp.bic&&`BIC : ${bp.bic}`].filter(Boolean).forEach(x=>line(String(x)))
    y+=6;line('Client',12,true);line(i.client);y+=10;line(`Montant total : ${Number(i.amount).toFixed(2)} EUR`,14,true)
    d.save(`${i.number}.pdf`)}
  const fld=(k:keyof Bill,l:string)=><label>{l}<input value={bp[k]} onChange={e=>setBp({...bp,[k]:e.target.value})}/></label>
  return <><div className="card"><h2>Mes informations de facturation</h2>
    {edit?<>{fld('company_name','Raison sociale')}{fld('siret','SIRET')}{fld('vat','N° TVA')}{fld('address','Adresse')}{fld('iban','IBAN')}{fld('bic','BIC')}{err&&<p className="err">{err}</p>}<button onClick={saveB}>Enregistrer</button></>
    :<><button className="ghost" onClick={()=>setEdit(true)}>Modifier mes informations</button>
      {([['company_name','Raison sociale'],['siret','SIRET'],['vat','N° TVA'],['address','Adresse'],['iban','IBAN'],['bic','BIC']] as [keyof Bill,string][]).map(([k,l])=><div key={k}><div className="mute">{l}</div><b>{bp[k]||'—'}</b></div>)}
      {missing.length>0&&<p className="err">À compléter pour des factures conformes : {missing.join(', ')}.</p>}</>}</div>
    <div className="card"><div className="row"><h2>Mes factures</h2><button style={{width:'auto'}} onClick={()=>setNf(true)}>+ Nouvelle facture</button></div>
      {(inv??[]).map(i=><div className="row" key={i.id}><span><b>{i.number}</b><div className="mute">{i.client}</div></span><span><b>{eur(Number(i.amount))}</b> <button className="ghost" onClick={()=>pdf(i)}>PDF</button></span></div>)}
      {inv&&!inv.length&&<p className="mute">Aucune facture.</p>}</div>
    {nf&&<Modal title="Nouvelle facture" onClose={()=>setNf(false)}><label>Client<input value={f.client} onChange={e=>setF({...f,client:e.target.value})}/></label>
      <label>Montant (€)<input inputMode="decimal" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label>{err&&<p className="err">{err}</p>}<button onClick={addInv}>Créer la facture</button></Modal>}</>
}

function Apporteur({uid,email}:{uid:string;email:string}){
  const[code,setCode]=useState(''),[n,setN]=useState({d:0,i:0}),[qr,setQr]=useState(''),[show,setShow]=useState(false),[ok,setOk]=useState(false)
  const link=code?`${import.meta.env.VITE_REFERRAL_BASE??'https://example.com/pompe-a-chaleur'}?code=${code}`:''
  useEffect(()=>{supabase.from('profiles').select('referral_code').eq('id',uid).single().then(r=>setCode(r.data?.referral_code??''))
    supabase.from('referrals').select('kind').eq('referrer_id',uid).then(r=>{const k=(r.data??[]) as {kind:string}[];setN({d:k.length,i:k.filter(x=>x.kind==='installation').length})})},[uid])
  useEffect(()=>{if(link)QRCode.toDataURL(link,{margin:1,width:280}).then(setQr)},[link])
  return <div className="card"><h2>Mon lien apporteur — pompe à chaleur</h2>
    <input readOnly value={link}/><div className="row"><button className="ghost" onClick={()=>navigator.clipboard?.writeText(link).then(()=>setOk(true))}>{ok?'Copié ✓':'Copier'}</button>
      <button style={{width:'auto'}} onClick={()=>setShow(true)}>QR code et envoi par e-mail</button></div><p/>
    <div className="grid2"><div className="card"><div className="mute">Demandes apportées</div><b style={{fontSize:'2rem'}}>{n.d}</b></div><div className="card"><div className="mute">Installations</div><b style={{fontSize:'2rem'}}>{n.i}</b></div></div>
    <p><b>Récompense prévue :</b> 100 €</p>
    <p className="mute">Ne démarchez pas par téléphone, SMS ou message : proposez le lien uniquement aux personnes intéressées que vous rencontrez.</p>
    {show&&<Modal title="Mon QR code apporteur" onClose={()=>setShow(false)}>{qr&&<img src={qr} alt="QR code du lien apporteur" style={{width:'100%',maxWidth:280,display:'block',margin:'0 auto',background:'#fff',borderRadius:12}}/>}<p/>
      <a className="btn" href={`mailto:${email}?subject=${encodeURIComponent('Mon lien apporteur')}&body=${encodeURIComponent(link)}`}>Envoyer par e-mail à {email}</a></Modal>}</div>
}

export default function Main({s}:{s:Session}){
  const uid=s.user.id,loc=useLocation().pathname.split('/')[2]??''
  const[sheet,setSheet]=useState(false),[help,setHelp]=useState(false),[p,setP]=useState<Prefs>(getPrefs()),[role,setRole]=useState('tech'),[name,setName]=useState(s.user.email??'')
  useEffect(()=>{supabase.from('profiles').select('role,full_name').eq('id',uid).single().then(r=>{if(r.data){setRole(r.data.role);setName(r.data.full_name??s.user.email??'')}})},[uid])
  useEffect(()=>{if(!p.auto)return;const t=setInterval(()=>sync(),30000);return()=>clearInterval(t)},[p.auto])
  const upd=(x:Partial<Prefs>)=>{const n={...p,...x};setP(n);setPrefs(n)}
  const close=()=>setSheet(false)
  const tile=(to:string,ic:string,l:string)=><Link key={to} className="tile" to={to} onClick={close}><span>{ic}</span>{l}</Link>
  return <><header className="top"><b>{TITLES[loc]??'Application'}</b><button className="ghost" onClick={()=>sync()} aria-label="Actualiser">↻</button></header>
    <div className="page"><Routes><Route index element={<Home/>}/><Route path="interventions" element={<Interventions/>}/><Route path="planning" element={<Planning/>}/>
      <Route path="tournees" element={<Tournees uid={uid}/>}/><Route path="optimiseur" element={<Optimiseur/>}/><Route path="admin" element={<Admin uid={uid} admin={role==='admin'}/>}/>
      <Route path="inventaire" element={<Inventaire admin={role==='admin'}/>}/><Route path="materiel" element={<Materiel/>}/>
      <Route path="documents" element={<Documents uid={uid}/>}/><Route path="factures" element={<Factures uid={uid} name={name}/>}/>
      <Route path="apporteur" element={<Apporteur uid={uid} email={s.user.email??''}/>}/></Routes></div>
    <nav className="nav"><NavLink to="/m" end>Accueil</NavLink><NavLink to="/m/interventions">Interventions</NavLink><NavLink to="/m/planning">Planning</NavLink><NavLink to="/m/tournees">Tournées</NavLink><button className="navbtn" onClick={()=>setSheet(true)}>Plus</button></nav>
    {sheet&&<Modal title={name} onClose={close}><p className="mute">{role==='admin'?'Administrateur':'Technicien'}</p>
      <div className="grid3">{tile('/m/inventaire','⇆','Mon inventaire')}{tile('/m/materiel','⇄','Mon matériel')}{tile('/m/documents','▤','Mes documents')}{tile('/m/factures','€','Mes factures')}{tile('/m/apporteur','♨','Mon lien apporteur')}{tile('/m/optimiseur','⚡','Optimiseur de tournée')}{role==='admin'&&tile('/m/admin','⚙','Administration')}</div><p/>
      <div className="grid4"><button className="tile" onClick={()=>upd({theme:p.theme==='dark'?'light':'dark'})}><span>◐</span>Mode sombre / clair</button>
        <button className="tile" onClick={()=>upd({compact:!p.compact})}><span>≡</span>Affichage compact{p.compact?' ✓':''}</button>
        <button className="tile" onClick={()=>upd({auto:!p.auto})}><span>⟳</span>Actualisation auto{p.auto?' ✓':''}</button>
        <button className="tile" onClick={()=>{close();setHelp(true)}}><span>?</span>Aide</button></div><p/>
      <Link className="btn" to="/" onClick={close}>Application terrain</Link><p/><button className="ghost" onClick={()=>supabase.auth.signOut()}>Déconnexion</button></Modal>}
    {help&&<Modal title="Aide" onClose={()=>setHelp(false)}><p>Accueil : vos chiffres du jour. Interventions : suivi et filtres. Planning : calendrier avec filtre par statut. Plus : matériel, documents, factures et lien apporteur.</p>
      <p className="mute">Les PV, photos, activité et stock fonctionnent hors-ligne dans l'application terrain. Documents, factures et lien apporteur demandent du réseau.</p></Modal>}</>
}
