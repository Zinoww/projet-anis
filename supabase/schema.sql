-- Exécuter dans Supabase > SQL Editor
create table profiles(id uuid primary key references auth.users on delete cascade, full_name text, role text not null default 'tech' check(role in('tech','admin')), created_at timestamptz default now());
create table interventions(id uuid primary key default gen_random_uuid(), ref text, client text not null, address text, city text, scheduled_at timestamptz not null, status text not null default 'planifiee' check(status in('planifiee','en_cours','terminee','a_replanifier')), assigned_to uuid references profiles(id), notes text, created_at timestamptz default now());
create table pv(id uuid primary key, intervention_id uuid not null references interventions(id) on delete cascade, tech_id uuid not null references profiles(id), outcome text not null check(outcome in('ok','ko')), work_done text, started_at timestamptz, ended_at timestamptz, signature text, photo_paths text[] default '{}', created_at timestamptz default now());
create index on interventions(assigned_to,scheduled_at);
create index on pv(intervention_id);

create function is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

alter table profiles enable row level security; alter table interventions enable row level security; alter table pv enable row level security;
create policy p_read on profiles for select using(id=auth.uid() or is_admin());
create policy i_read on interventions for select using(assigned_to=auth.uid() or is_admin());
create policy i_upd on interventions for update using(assigned_to=auth.uid() or is_admin());
create policy i_adm on interventions for all using(is_admin()) with check(is_admin());
create policy pv_rw on pv for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid() or is_admin());

insert into storage.buckets(id,name,public) values('pv-photos','pv-photos',false) on conflict do nothing;
create policy ph_rw on storage.objects for all to authenticated using(bucket_id='pv-photos' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin())) with check(bucket_id='pv-photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- Démo (après avoir créé un compte) :
-- insert into interventions(ref,client,address,city,scheduled_at,assigned_to) select 'INT-001','Mme Martin','12 rue de la Paix','Rouen',now(),id from profiles limit 1;
-- Passer admin : update profiles set role='admin' where id='<uuid>';
