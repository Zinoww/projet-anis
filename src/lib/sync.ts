import {supabase} from './supabase'
import {db,type Intervention} from './db'
let busy=false,again=false

/** Une passe : on envoie d'abord ce qui est en attente, puis on recharge le serveur
 *  en RÉAPPLIQUANT ce qui n'est pas encore parti (pour ne jamais afficher une valeur périmée).
 *  Chaque étape est isolée : une erreur n'empêche pas les autres de s'exécuter. */
async function pass():Promise<string|null>{
  const errs:string[]=[]
  const step=async(f:()=>Promise<void>)=>{try{await f()}catch(e:any){errs.push(e?.message??'Erreur de synchronisation')}}
  const uid=(await supabase.auth.getSession()).data.session?.user.id
  // --- envoyer ---
  await step(async()=>{for(const op of await db.statusops.toArray()){const{error}=await supabase.from('interventions').update({status:op.status}).eq('id',op.intervention_id);if(error)throw error;await db.statusops.delete(op.id!)}})
  await step(async()=>{for(const pv of await db.outbox.toArray()){
    const paths:string[]=[]
    for(const[i,b]of pv.photos.entries()){
      const p=`${pv.tech_id}/${pv.id}/${i}.jpg`
      const{error}=await supabase.storage.from('pv-photos').upload(p,b,{upsert:true,contentType:'image/jpeg'})
      if(error)throw error;paths.push(p)}
    const{photos:_,...row}=pv
    const r1=await supabase.from('pv').upsert({...row,photo_paths:paths});if(r1.error)throw r1.error
    const r2=await supabase.from('interventions').update({status:pv.outcome==='ok'?'terminee':'a_replanifier'}).eq('id',pv.intervention_id);if(r2.error)throw r2.error
    await db.outbox.delete(pv.id)}})
  await step(async()=>{for(const op of await db.stockops.toArray()){const{error}=await supabase.rpc('use_stock',{item:op.item_id,n:op.n});if(error)throw error;await db.stockops.delete(op.id!)}})
  await step(async()=>{for(const a of await db.activity.where('synced').equals(0).toArray()){const{synced:_s,...r}=a;const{error}=await supabase.from('activity').upsert({...r,tech_id:uid});if(error)throw error;await db.activity.update(a.day,{synced:1})}})
  // --- recevoir ---
  await step(async()=>{
    const{data,error}=await supabase.from('interventions').select('id,ref,client,address,city,scheduled_at,status,notes');if(error)throw error
    const[ops,pend]=await Promise.all([db.statusops.toArray(),db.outbox.toArray()])
    const rows=(data as Intervention[]).map(r=>{let status=r.status
      for(const o of ops)if(o.intervention_id===r.id)status=o.status
      const p=pend.find(x=>x.intervention_id===r.id);if(p)status=p.outcome==='ok'?'terminee':'a_replanifier'
      return{...r,status}})
    await db.transaction('rw',db.interventions,async()=>{await db.interventions.clear();await db.interventions.bulkPut(rows)})})
  await step(async()=>{
    const st=await supabase.from('stock_items').select('id,barcode,name,qty');if(st.error)throw st.error
    const sops=await db.stockops.toArray()
    const rows=(st.data as {id:string;barcode:string;name:string;qty:number}[]).map(r=>({...r,qty:Math.max(0,r.qty-sops.filter(o=>o.item_id===r.id).reduce((a,o)=>a+o.n,0))}))
    await db.transaction('rw',db.stock,async()=>{await db.stock.clear();await db.stock.bulkPut(rows)})})
  await step(async()=>{
    const ac=await supabase.from('activity').select('day,hours,km,fees').order('day',{ascending:false}).limit(60);if(ac.error)throw ac.error
    const dirty=new Set((await db.activity.where('synced').equals(0).toArray()).map(a=>a.day))
    await db.activity.bulkPut(ac.data.filter(r=>!dirty.has(r.day)).map(r=>({...r,hours:+r.hours,km:+r.km,fees:+r.fees,synced:1 as const})))})
  await step(async()=>{
    const pr=await supabase.from('pv').select('id,intervention_id,outcome,ended_at,photo_paths').order('ended_at',{ascending:false}).limit(100);if(pr.error)throw pr.error
    await db.pvs.bulkPut(pr.data as never[])})
  return errs[0]??null
}

/** Si une synchro est déjà en cours, la demande est mémorisée et rejouée juste après (rien n'est ignoré). */
export async function sync():Promise<string|null>{
  if(!navigator.onLine)return null
  if(busy){again=true;return null}
  busy=true
  try{let err:string|null;do{again=false;err=await pass()}while(again&&!err);return err}
  finally{busy=false}
}
export async function compress(file:File,max=1280):Promise<Blob>{
  const bmp=await createImageBitmap(file),s=Math.min(1,max/Math.max(bmp.width,bmp.height))
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s)
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height)
  return new Promise(r=>c.toBlob(b=>r(b!),'image/jpeg',0.7))
}
