import pgserver, psycopg, uuid, shutil, sys
shutil.rmtree('/tmp/pgdata',ignore_errors=True)
srv=pgserver.get_server('/tmp/pgdata',cleanup_mode='stop')
conn=psycopg.connect(srv.get_uri(),autocommit=True)
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','supabase')+'/'
conn.execute("""
create schema auth; create schema storage;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create role authenticated nologin;""")
ok=0;ko=0
def check(name,cond,detail=''):
    global ok,ko
    if cond: ok+=1;print('PASS',name)
    else: ko+=1;print('FAIL',name,detail)
for f in ['schema.sql','002_stock_activity.sql','003_main_app.sql','004_admin.sql','005_security.sql','006_admin_app.sql']:
    try: conn.execute(open(S+f).read()); check('migration '+f,True)
    except Exception as e: check('migration '+f,False,str(e)[:200]); sys.exit(1)
conn.execute("""grant usage on schema public,auth,storage to authenticated; grant all on all tables in schema public to authenticated;
grant all on storage.objects to authenticated; grant execute on all functions in schema public to authenticated;""")
def run(uid,sql,p=None):
    try:
        with conn.transaction():
            conn.execute("set local role authenticated")
            if uid: conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(str(uid),))
            cur=conn.execute(sql,p)
            rows=cur.fetchall() if cur.description else cur.rowcount
            return 'ok',rows
    except psycopg.Error as e: return 'err',str(e).splitlines()[0]
A,T1,T2=[uuid.uuid4() for _ in range(3)]
for u,m in [(A,'admin@x.fr'),(T1,'t1@x.fr'),(T2,'t2@x.fr')]:
    conn.execute("insert into auth.users(id,email) values(%s,%s)",(u,m))
conn.execute("update profiles set role='admin' where id=%s",(A,))
check('trigger crée les profils',conn.execute("select count(*) from profiles").fetchone()[0]==3)
check('code apporteur généré et unique',conn.execute("select count(distinct referral_code) from profiles where referral_code is not null").fetchone()[0]==3)
# admin crée des données
for t,c in [(T1,'Martin'),(T2,'Durand')]:
    r=run(A,"insert into interventions(client,scheduled_at,assigned_to) values(%s,now(),%s)",(c,t)); check('admin crée intervention '+c,r[0]=='ok',r)
r=run(A,"insert into stock_items(barcode,name,qty,assigned_to) values('3760000000017','Vanne',5,%s),('999','Autre',3,%s)",(T1,T2)); check('admin crée stock',r[0]=='ok',r)
# isolation
check('tech1 ne voit que ses interventions',run(T1,"select client from interventions")[1]==[('Martin',)])
check('admin voit tout',len(run(A,"select 1 from interventions")[1])==2)
iid1=conn.execute("select id from interventions where client='Martin'").fetchone()[0]
iid2=conn.execute("select id from interventions where client='Durand'").fetchone()[0]
check('tech1 change statut de la sienne',run(T1,"update interventions set status='en_cours' where id=%s",(iid1,))[1]==1)
r=run(T1,"update interventions set assigned_to=%s where id=%s",(T2,iid1)); check('tech1 NE PEUT PAS réassigner',r[0]=='err' and 'non autorisée' in r[1],r)
r=run(T1,"update interventions set client='X' where id=%s",(iid1,)); check('tech1 NE PEUT PAS changer le client',r[0]=='err',r)
check('tech1 ne touche pas celle de tech2',run(T1,"update interventions set status='terminee' where id=%s",(iid2,))[1]==0)
check('admin peut réassigner',run(A,"update interventions set assigned_to=%s where id=%s",(T1,iid1))[1]==1)
# PV
pid=uuid.uuid4()
check('tech1 crée son PV',run(T1,"insert into pv(id,intervention_id,tech_id,outcome) values(%s,%s,%s,'ok')",(pid,iid1,T1))[0]=='ok')
check('tech1 NE PEUT PAS créer un PV au nom de tech2',run(T1,"insert into pv(id,intervention_id,tech_id,outcome) values(%s,%s,%s,'ok')",(uuid.uuid4(),iid1,T2))[0]=='err')
check('tech2 ne voit pas le PV de tech1',run(T2,"select 1 from pv")[1]==[])
# profils / rôles
check('tech1 NE PEUT PAS se passer admin',run(T1,"update profiles set role='admin' where id=%s",(T1,))[1]==0)
check('admin change un rôle',run(A,"update profiles set role='admin' where id=%s",(T2,))[1]==1)
conn.execute("update profiles set role='tech' where id=%s",(T2,))
# stock
check('tech1 ne voit que son stock',run(T1,"select name from stock_items")[1]==[('Vanne',)])
run(T1,"select use_stock(%s,1)",(conn.execute("select id from stock_items where name='Vanne'").fetchone()[0],))
check('use_stock décrémente',conn.execute("select qty from stock_items where name='Vanne'").fetchone()[0]==4)
run(T1,"select use_stock(%s,1)",(conn.execute("select id from stock_items where name='Autre'").fetchone()[0],))
check("use_stock refuse l'article d'un autre",conn.execute("select qty from stock_items where name='Autre'").fetchone()[0]==3)
run(T1,"select use_stock(%s,99)",(conn.execute("select id from stock_items where name='Vanne'").fetchone()[0],))
check('use_stock ne passe jamais sous 0',conn.execute("select qty from stock_items where name='Vanne'").fetchone()[0]==0)
check('tech1 NE PEUT PAS modifier le stock directement',run(T1,"update stock_items set qty=100")[1]==0)
# activité (upsert comme le client)
up="insert into activity(tech_id,day,hours,km,fees) values(%s,'2026-11-13',7,40,10) on conflict(tech_id,day) do update set hours=excluded.hours"
check('activité upsert 1',run(T1,up,(T1,))[0]=='ok'); check('activité upsert 2 (même jour)',run(T1,up,(T1,))[0]=='ok')
check('activité au nom d\'un autre refusée',run(T1,"insert into activity(tech_id,day) values(%s,'2026-11-14')",(T2,))[0]=='err')
# documents / factures / facturation
check('tech1 crée un document',run(T1,"insert into documents(tech_id,type,title,file_path) values(%s,'Kbis','k',%s)",(T1,f'{T1}/a.pdf'))[0]=='ok')
check('tech2 ne voit pas les documents de tech1',run(T2,"select 1 from documents")[1]==[])
check('facture créée',run(T1,"insert into invoices(tech_id,number,client,amount) values(%s,'F-2026-0001','C',100)",(T1,))[0]=='ok')
check('tech2 ne voit pas les factures de tech1',run(T2,"select 1 from invoices")[1]==[])
check('infos facturation upsert',run(T1,"insert into billing_profiles(tech_id,company_name) values(%s,'Z') on conflict(tech_id) do update set company_name=excluded.company_name",(T1,))[0]=='ok')
check('tech1 lit son code apporteur',len(run(T1,"select referral_code from profiles where id=%s",(T1,))[1][0][0])==6)
check('tech1 ne peut pas inventer de parrainage',run(T1,"insert into referrals(referrer_id,kind) values(%s,'installation')",(T1,))[0]=='err')
# stockage
check('tech1 dépose un fichier dans son dossier',run(T1,"insert into storage.objects(bucket_id,name) values('documents',%s)",(f'{T1}/doc.pdf',))[0]=='ok')
check('tech1 NE PEUT PAS déposer chez tech2',run(T1,"insert into storage.objects(bucket_id,name) values('documents',%s)",(f'{T2}/doc.pdf',))[0]=='err')
check('tech2 ne voit pas le fichier de tech1',run(T2,"select 1 from storage.objects")[1]==[])
check('admin voit le fichier de tech1',len(run(A,"select 1 from storage.objects")[1])==1)

# ---- app admin (006) ----
inv1=conn.execute("select id from invoices where tech_id=%s",(T1,)).fetchone()[0]
check('admin change le statut de la facture d\'un technicien',run(A,"update invoices set status='payee' where id=%s",(inv1,))[1]==1)
check('tech2 NE PEUT PAS modifier la facture de tech1',run(T2,"update invoices set status='brouillon' where id=%s",(inv1,))[1]==0)
check('tech1 modifie toujours sa propre facture',run(T1,"update invoices set status='envoyee' where id=%s",(inv1,))[1]==1)
check('tech1 NE PEUT PAS créer une facture au nom de tech2',run(T1,"insert into invoices(tech_id,number,client) values(%s,'X','Y')",(T2,))[0]=='err')
check('admin voit toutes les factures',len(run(A,"select 1 from invoices")[1])==1)
check('admin voit les documents des techniciens',len(run(A,"select 1 from documents")[1])==1)
check("admin voit l'activité des techniciens",len(run(A,"select 1 from activity")[1])==1)
check('admin voit les PV de tous',len(run(A,"select 1 from pv")[1])==1)
check('referrals.paid vaut false par défaut',run(A,"insert into referrals(referrer_id,kind) values(%s,'installation') returning paid",(T1,))[1]==[(False,)])
rid=conn.execute("select id from referrals").fetchone()[0]
check('tech1 voit son parrainage',len(run(T1,"select 1 from referrals")[1])==1)
check('tech2 ne voit pas le parrainage de tech1',run(T2,"select 1 from referrals")[1]==[])
check('tech1 NE PEUT PAS se marquer payé',run(T1,"update referrals set paid=true where id=%s",(rid,))[1]==0)
check('admin marque payé',run(A,"update referrals set paid=true where id=%s",(rid,))[1]==1)
check('admin voit les profils de tous',len(run(A,"select 1 from profiles")[1])==3)
check('tech1 ne voit que son profil',len(run(T1,"select 1 from profiles")[1])==1)
print(f'\nRESULTAT : {ok} réussis, {ko} échoués')
