import {supabase} from './supabase'
import {db} from './db'
let busy=false
export async function sync():Promise<string|null>{
  if(busy||!navigator.onLine)return null
  busy=true
  try{
    for(const op of await db.statusops.toArray()){const{error}=await supabase.from('interventions').update({status:op.status}).eq('id',op.intervention_id);if(error)throw error;await db.statusops.delete(op.id!)}
    for(const pv of await db.outbox.toArray()){
      const paths:string[]=[]
      for(const[i,b]of pv.photos.entries()){
        const p=`${pv.tech_id}/${pv.id}/${i}.jpg`
        const{error}=await supabase.storage.from('pv-photos').upload(p,b,{upsert:true,contentType:'image/jpeg'})
        if(error)throw error;paths.push(p)}
      const{photos:_,...row}=pv
      const r1=await supabase.from('pv').upsert({...row,photo_paths:paths});if(r1.error)throw r1.error
      const r2=await supabase.from('interventions').update({status:pv.outcome==='ok'?'terminee':'a_replanifier'}).eq('id',pv.intervention_id);if(r2.error)throw r2.error
      await db.outbox.delete(pv.id)}
    const uid=(await supabase.auth.getSession()).data.session?.user.id
    for(const op of await db.stockops.toArray()){const{error}=await supabase.rpc('use_stock',{item:op.item_id,n:op.n});if(error)throw error;await db.stockops.delete(op.id!)}
    for(const a of await db.activity.where('synced').equals(0).toArray()){const{synced:_s,...r}=a;const{error}=await supabase.from('activity').upsert({...r,tech_id:uid});if(error)throw error;await db.activity.update(a.day,{synced:1})}
    const{data,error}=await supabase.from('interventions').select('id,ref,client,address,city,scheduled_at,status,notes')
    if(error)throw error
    await db.transaction('rw',db.interventions,async()=>{await db.interventions.clear();await db.interventions.bulkPut(data as never[])})
    const st=await supabase.from('stock_items').select('id,barcode,name,qty');if(st.error)throw st.error
    await db.transaction('rw',db.stock,async()=>{await db.stock.clear();await db.stock.bulkPut(st.data)})
    const ac=await supabase.from('activity').select('day,hours,km,fees').order('day',{ascending:false}).limit(60);if(ac.error)throw ac.error
    await db.activity.bulkPut(ac.data.map(r=>({...r,hours:+r.hours,km:+r.km,fees:+r.fees,synced:1 as const})))
    const pr=await supabase.from('pv').select('id,intervention_id,outcome,ended_at,photo_paths').order('ended_at',{ascending:false}).limit(100);if(pr.error)throw pr.error
    await db.pvs.bulkPut(pr.data as never[])
    return null
  }catch(e:any){return e?.message??'Erreur de synchronisation'}finally{busy=false}
}
export async function compress(file:File,max=1280):Promise<Blob>{
  const bmp=await createImageBitmap(file),s=Math.min(1,max/Math.max(bmp.width,bmp.height))
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s)
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height)
  return new Promise(r=>c.toBlob(b=>r(b!),'image/jpeg',0.7))
}
