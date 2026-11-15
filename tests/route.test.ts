import {describe,it,expect,vi,beforeEach} from 'vitest'
vi.mock('../src/lib/supabase',()=>({supabase:{}}))
import {order,plan,toMin,hm} from '../src/Route'

const P=(o={})=>({start:'DEP',date:'2026-11-14',end:'last' as const,from:'08:00',until:'18:00',lunch:60,service:30,by:'time' as const,title:'T',...o})
// points sur une ligne : DEP=0, A=1, C=2, B=3 (1 unité = 10 min = 10 km)
const X:Record<string,number>={DEP:0,A:1,B:3,C:2}
beforeEach(()=>{vi.stubGlobal('fetch',async(url:string)=>{
  if(url.includes('api-adresse')){const q=decodeURIComponent(url.split('q=')[1].split('&')[0]);return{json:async()=>({features:q in X?[{geometry:{coordinates:[X[q],0]}}]:[]})}}
  if(url.includes('osrm')){const xs=url.split('/driving/')[1].split('?')[0].split(';').map(c=>+c.split(',')[0])
    const m=(k:number)=>xs.map(a=>xs.map(b=>Math.abs(a-b)*k));return{json:async()=>({code:'Ok',durations:m(600),distances:m(10000)})}}
  throw new Error('url inattendue '+url)})})

describe('utilitaires',()=>{
  it('toMin / hm',()=>{expect(toMin('08:30')).toBe(510);expect(hm(510)).toBe('08:30');expect(hm(59.6)).toBe('01:00');expect(hm(1445)).toBe('00:05')})
})
describe('order (optimisation)',()=>{
  const line=[0,1,3,2].map(x=>[0,1,3,2].map(y=>Math.abs(x-y)))  // 0=départ, 1:x=1, 2:x=3, 3:x=2
  it('trouve l’ordre optimal sur une ligne',()=>{expect(order(line,3,false)).toEqual([1,3,2])})
  it('retourne une permutation valide, aussi en boucle fermée',()=>{const o=order(line,3,true);expect([...o].sort()).toEqual([1,2,3])})
  it('un seul arrêt',()=>{expect(order([[0,5],[5,0]],1,true)).toEqual([1])})
  it('ne fait jamais pire que le plus proche voisin (20 matrices aléatoires)',()=>{
    for(let t=0;t<20;t++){const n=8,pts=Array.from({length:n+1},()=>[Math.random()*100,Math.random()*100])
      const c=pts.map(a=>pts.map(b=>Math.hypot(a[0]-b[0],a[1]-b[1])))
      const cost=(o:number[])=>{let s=0,p=0;for(const j of o){s+=c[p][j];p=j}return s}
      const nn:number[]=[];const left=new Set(Array.from({length:n},(_,i)=>i+1));let cur=0
      while(left.size){let b=-1;for(const j of left)if(b<0||c[cur][j]<c[cur][b])b=j;nn.push(b);left.delete(b);cur=b}
      const o=order(c,n,false);expect(o.length).toBe(n);expect(cost(o)).toBeLessThanOrEqual(cost(nn)+1e-9)}})
})
describe('plan (horaires)',()=>{
  it('ordre et heures d’arrivée corrects',async()=>{
    const r=await plan(['A','B','C'],P())
    expect(r.legs.map(l=>l.label)).toEqual(['A','C','B'])
    expect(r.legs.map(l=>hm(l.arrive))).toEqual(['08:10','08:50','09:30'])
    expect(r.km).toBeCloseTo(30);expect(hm(r.end)).toBe('10:00');expect(r.over).toBe(false);expect(r.approx).toBe(false)})
  it('retour au départ ajoute le trajet de retour',async()=>{
    const r=await plan(['A','B','C'],P({end:'back'}));expect(r.km).toBeCloseTo(60);expect(hm(r.end)).toBe('10:30')})
  it('insère la pause déjeuner après midi',async()=>{
    const r=await plan(['A','B','C'],P({from:'11:30'}));const l=r.legs.find(x=>x.lunchBefore)!
    expect(l.label).toBe('C');expect(hm(l.arrive)).toBe('13:20')})
  it('signale un dépassement de fin de journée',async()=>{expect((await plan(['A','B','C'],P({until:'09:00'}))).over).toBe(true)})
  it('adresse introuvable listée sans bloquer',async()=>{
    const r=await plan(['A','ZZZ'],P());expect(r.bad).toEqual(['ZZZ']);expect(r.legs).toHaveLength(1)})
  it('erreur claire si départ invalide ou aucune adresse',async()=>{
    await expect(plan(['A'],P({start:'NOPE'}))).rejects.toThrow('adresse de départ')
    await expect(plan(['ZZZ'],P())).rejects.toThrow('Aucune adresse')})
  it('repli à vol d’oiseau si le serveur d’itinéraire échoue',async()=>{
    const base=(globalThis as any).fetch;vi.stubGlobal('fetch',async(u:string)=>u.includes('osrm')?{json:async()=>({code:'Error'})}:base(u))
    const r=await plan(['A','B'],P());expect(r.approx).toBe(true);expect(r.legs).toHaveLength(2)})
})
