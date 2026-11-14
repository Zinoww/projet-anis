import 'fake-indexeddb/auto'
import {describe,it,expect,vi,beforeEach} from 'vitest'
const log:string[]=[];const fail:Record<string,string>={}
const data:Record<string,unknown[]>={}
vi.mock('../lib/supabase',()=>{
  const chain=(t:string)=>{let op='select';const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,
    update:(v:any)=>{op='update';log.push(`update ${t} ${v.status??''}`.trim());return q},
    upsert:(v:any)=>{op='upsert';log.push(`upsert ${t}${v.outcome?' '+v.outcome:''}`);return q},
    then:(res:any,rej:any)=>Promise.resolve(op==='select'?{data:data[t]??[],error:null}:{data:null,error:fail[t]?{message:fail[t]}:null}).then(res,rej)};return q}
  return{supabase:{from:chain,rpc:async(n:string,a:any)=>{log.push(`rpc ${n} ${a.n}`);return{error:null}},
    storage:{from:()=>({upload:async(p:string)=>{log.push('upload '+p);return{error:null}}})},
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})}}}})
import {db} from '../lib/db'
import {sync} from '../lib/sync'
const iv=(id:string,status='planifiee')=>({id,ref:null,client:'C'+id,address:null,city:null,scheduled_at:'2026-11-14T08:00:00Z',status:status as 'planifiee',notes:null})
const pv=(id:string,outcome:'ok'|'ko'='ok')=>({id,intervention_id:'i1',tech_id:'u1',outcome,work_done:'',started_at:'',ended_at:'2026-11-14T10:00:00Z',signature:'sig',photos:[new Blob(['a']),new Blob(['b'])]})
beforeEach(async()=>{log.length=0;for(const k of Object.keys(fail))delete fail[k];data.interventions=[iv('i1','terminee')];data.stock_items=[{id:'s1',barcode:'1',name:'V',qty:4}];data.activity=[];data.pv=[]
  vi.stubGlobal('navigator',{onLine:true});await Promise.all(db.tables.map(t=>t.clear()))})

describe('synchronisation hors-ligne',()=>{
  it('envoie PV + photos, vide la file, puis recharge les données',async()=>{
    await db.outbox.put(pv('p1'));expect(await sync()).toBeNull()
    expect(log).toContain('upload u1/p1/0.jpg');expect(log).toContain('upload u1/p1/1.jpg');expect(log).toContain('upsert pv ok');expect(log).toContain('update interventions terminee')
    expect(await db.outbox.count()).toBe(0);expect((await db.interventions.toArray()).map(i=>i.id)).toEqual(['i1']);expect((await db.stock.toArray())[0].qty).toBe(4)})
  it('"en cours" est envoyé AVANT le PV terminé (le PV gagne)',async()=>{
    await db.statusops.add({intervention_id:'i1',status:'en_cours'});await db.outbox.put(pv('p1'));await sync()
    expect(log.indexOf('update interventions en_cours')).toBeLessThan(log.indexOf('update interventions terminee'))})
  it('PV KO → à replanifier',async()=>{await db.outbox.put(pv('p2','ko'));await sync();expect(log).toContain('update interventions a_replanifier')})
  it('en cas d’erreur serveur, le PV reste dans la file (rien n’est perdu)',async()=>{
    fail.pv='boom';await db.outbox.put(pv('p1'));const e=await sync();expect(e).toBe('boom');expect(await db.outbox.count()).toBe(1)
    delete fail.pv;expect(await sync()).toBeNull();expect(await db.outbox.count()).toBe(0)})
  it('hors ligne : ne fait rien',async()=>{vi.stubGlobal('navigator',{onLine:false});await db.outbox.put(pv('p1'));expect(await sync()).toBeNull();expect(log).toEqual([]);expect(await db.outbox.count()).toBe(1)})
  it('rejoue les utilisations de stock et l’activité',async()=>{
    await db.stockops.add({item_id:'s1',n:1});await db.activity.put({day:'2026-11-14',hours:7,km:30,fees:5,synced:0});await sync()
    expect(log).toContain('rpc use_stock 1');expect(log).toContain('upsert activity');expect(await db.stockops.count()).toBe(0)
    expect((await db.activity.get('2026-11-14'))!.synced).toBe(1)})
  it('pas de double envoi si deux synchronisations se chevauchent',async()=>{
    await db.outbox.put(pv('p1'));await Promise.all([sync(),sync()]);expect(log.filter(l=>l==='upsert pv ok')).toHaveLength(1)})
})
