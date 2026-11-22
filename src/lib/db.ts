import Dexie,{type Table} from 'dexie'
export type Status='planifiee'|'en_cours'|'terminee'|'a_replanifier'
export interface Intervention{
  id:string
  ref:string|null
  client:string
  address:string|null
  city:string|null
  postal_code:string|null
  scheduled_at:string
  status:Status
  notes:string|null
  assigned_to:string|null
  details:Record<string,string|number|null>|null
}
export interface PV{id:string;intervention_id:string;tech_id:string;outcome:'ok'|'ko';work_done:string;started_at:string;ended_at:string;signature:string|null;photos:Blob[]}
class TerrainDB extends Dexie{interventions!:Table<Intervention,string>;outbox!:Table<PV,string>;stock!:Table<Stock,string>;activity!:Table<Activity,string>;stockops!:Table<StockOp,number>;pvs!:Table<PVRow,string>;statusops!:Table<StatusOp,number>
constructor(){super('terrain');this.version(1).stores({interventions:'id,scheduled_at,status',outbox:'id'});this.version(2).stores({stock:'id,barcode',activity:'day,synced',stockops:'++id'});this.version(3).stores({pvs:'id,intervention_id,ended_at'});this.version(4).stores({statusops:'++id'})}}
export interface Stock{id:string;barcode:string;name:string;qty:number}
export interface Activity{day:string;hours:number;km:number;fees:number;synced:0|1}
export interface StockOp{id?:number;item_id:string;n:number}
export interface PVRow{id:string;intervention_id:string;outcome:'ok'|'ko';ended_at:string;photo_paths:string[]}
export interface StatusOp{id?:number;intervention_id:string;status:Status}
export const db=new TerrainDB()
