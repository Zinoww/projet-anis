import pgserver, psycopg, shutil, uuid
shutil.rmtree('/tmp/pgdata2',ignore_errors=True)
srv=pgserver.get_server('/tmp/pgdata2',cleanup_mode='stop');c=psycopg.connect(srv.get_uri(),autocommit=True)
c.execute("""create schema auth; create schema storage;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create role authenticated nologin;""")
for f in ['/home/claude/terrain/supabase/schema.sql','/home/claude/terrain/supabase/run_all_missing.sql']: c.execute(open(f).read())
seed=open('/mnt/user-data/outputs/donnees_test_admin.sql').read();clean=open('/mnt/user-data/outputs/supprimer_donnees_test.sql').read()
ok=ko=0
def chk(n,cond,d=''):
    global ok,ko
    if cond: ok+=1;print('PASS',n)
    else: ko+=1;print('FAIL',n,d)
def counts(): return {r[0]:r[1] for r in c.execute("select 'i',count(*) from interventions union all select 'pv',count(*) from pv union all select 's',count(*) from stock_items union all select 'a',count(*) from activity union all select 'd',count(*) from documents union all select 'f',count(*) from invoices union all select 'r',count(*) from referrals").fetchall()}
def seedrun():
    cur=c.execute(seed);
    while cur.description is None and cur.nextset(): pass
    return cur
# cas 1 : un seul compte
A=uuid.uuid4();c.execute("insert into auth.users(id,email) values(%s,'boyhnaim@gmail.com')",(A,))
real=c.execute("insert into interventions(ref,client,scheduled_at,assigned_to) values('REEL-1','Vrai client',now(),%s) returning id",(A,)).fetchone()[0]
c.execute("insert into stock_items(barcode,name,qty,assigned_to) values('3760000000017','Réel',5,%s)",(A,))
c.execute("insert into activity(tech_id,day,hours,km,fees) values(%s,current_date-1,8,50,10.00)",(A,))
seedrun();n=counts()
chk('1 compte : 10 interventions + 1 réelle',n['i']==11,n);chk('3 PV',n['pv']==3);chk('4 stocks + 1 réel',n['s']==5);chk('activité : 6 jours, la vraie ligne est conservée',n['a']==6 and c.execute('select count(*) from activity where fees=10.00').fetchone()[0]==1,n)
chk('documents/factures/parrainages',(n['d'],n['f'],n['r'])==(3,3,6),n)
# idempotence
seedrun();n2=counts();chk('relancer ne crée pas de doublons',n==n2,(n,n2))
# tout est assigné à l'admin quand user@ n'existe pas
chk('tout assigné à l\'admin seul',c.execute("select count(*) from interventions where ref like 'TEST-%%' and assigned_to is not null and assigned_to<>%s",(A,)).fetchone()[0]==0)
# cas 2 : deux comptes
T=uuid.uuid4();c.execute("insert into auth.users(id,email) values(%s,'user@gmail.com')",(T,));c.execute("insert into profiles(id,full_name) values(%s,'user@gmail.com') on conflict do nothing",(T,))
seedrun();chk('2 comptes : interventions du technicien',c.execute("select count(*) from interventions where ref like 'TEST-%%' and assigned_to=%s",(T,)).fetchone()[0]==4)
chk('statuts variés',len(c.execute("select distinct status from interventions where ref like 'TEST-%'").fetchall())==4)
chk('documents : un expiré, un bientôt',c.execute("select count(*) from documents where title like '[TEST]%' and expires_on<current_date").fetchone()[0]==1 and c.execute("select count(*) from documents where title like '[TEST]%' and expires_on between current_date and current_date+30").fetchone()[0]==1)
chk('stock bas',c.execute("select count(*) from stock_items where barcode like 'TEST%' and qty<=2").fetchone()[0]==2)
chk('signature = image PNG valide',c.execute("select count(*) from pv where signature like 'data:image/png;base64,iVBOR%'").fetchone()[0]==3)
# nettoyage
c.execute(clean);n3=counts()
chk('nettoyage : seules les données TEST disparaissent',(n3['i'],n3['pv'],n3['s'],n3['d'],n3['f'],n3['r'])==(1,0,1,0,0,0),n3)
chk('la vraie intervention et le vrai stock restent',c.execute("select count(*) from interventions where id=%s",(real,)).fetchone()[0]==1)
chk('la vraie activité reste',c.execute("select count(*) from activity where fees=10.00").fetchone()[0]==1)
print(f'\nRESULTAT : {ok} réussis, {ko} échoués')
