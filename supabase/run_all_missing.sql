-- SCRIPT UNIQUE ET SANS RISQUE : peut être relancé plusieurs fois.
-- Complète tout ce qui manque (fichiers 002 à 006). Prérequis : schema.sql déjà lancé.

-- ===== 002 : stock + activité =====
create table if not exists stock_items(id uuid primary key default gen_random_uuid(), barcode text not null, name text not null, qty int not null default 0 check(qty>=0), assigned_to uuid references profiles(id), created_at timestamptz default now());
create index if not exists stock_items_assigned_barcode_idx on stock_items(assigned_to,barcode);
create table if not exists activity(tech_id uuid references profiles(id), day date, hours numeric not null default 0, km numeric not null default 0, fees numeric not null default 0, primary key(tech_id,day));
alter table stock_items enable row level security; alter table activity enable row level security;
drop policy if exists s_read on stock_items; create policy s_read on stock_items for select using(assigned_to=auth.uid() or is_admin());
drop policy if exists s_adm on stock_items; create policy s_adm on stock_items for all using(is_admin()) with check(is_admin());
drop policy if exists a_rw on activity; create policy a_rw on activity for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid() or is_admin());
create or replace function use_stock(item uuid,n int) returns void language sql security definer set search_path=public as $$ update stock_items set qty=greatest(qty-n,0) where id=item and assigned_to=auth.uid() $$;

-- ===== 003 : app principale =====
alter table profiles add column if not exists referral_code text unique default upper(substr(md5(random()::text),1,6));
create table if not exists referrals(id uuid primary key default gen_random_uuid(), referrer_id uuid not null references profiles(id), kind text not null default 'demande' check(kind in('demande','installation')), created_at timestamptz default now());
create table if not exists documents(id uuid primary key default gen_random_uuid(), tech_id uuid not null references profiles(id), type text not null, title text not null, issued_on date, expires_on date, file_path text not null, created_at timestamptz default now());
create table if not exists billing_profiles(tech_id uuid primary key references profiles(id), company_name text, siret text, vat text, address text, iban text, bic text);
create table if not exists invoices(id uuid primary key default gen_random_uuid(), tech_id uuid not null references profiles(id), number text not null, client text not null, amount numeric not null default 0, status text not null default 'brouillon', created_at timestamptz default now());
alter table referrals enable row level security; alter table documents enable row level security; alter table billing_profiles enable row level security; alter table invoices enable row level security;
drop policy if exists r_read on referrals; create policy r_read on referrals for select using(referrer_id=auth.uid() or is_admin());
drop policy if exists r_adm on referrals; create policy r_adm on referrals for all using(is_admin()) with check(is_admin());
drop policy if exists d_rw on documents; create policy d_rw on documents for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid());
drop policy if exists b_rw on billing_profiles; create policy b_rw on billing_profiles for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid());
insert into storage.buckets(id,name,public) values('documents','documents',false) on conflict do nothing;
drop policy if exists doc_rw on storage.objects; create policy doc_rw on storage.objects for all to authenticated using(bucket_id='documents' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin())) with check(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);

-- ===== 004 : l'admin peut changer les rôles =====
drop policy if exists p_adm on profiles; create policy p_adm on profiles for update using(is_admin()) with check(is_admin());

-- ===== 005 : un technicien ne change que le statut =====
create or replace function guard_intervention_update() returns trigger language plpgsql as $$
begin
  if not is_admin() and (new.assigned_to is distinct from old.assigned_to or new.client is distinct from old.client or new.scheduled_at is distinct from old.scheduled_at or new.address is distinct from old.address or new.city is distinct from old.city or new.ref is distinct from old.ref) then
    raise exception 'Modification non autorisée';
  end if;
  return new;
end $$;
drop trigger if exists guard_int on interventions;
create trigger guard_int before update on interventions for each row execute function guard_intervention_update();

-- ===== 006 : app admin =====
alter table referrals add column if not exists paid boolean not null default false;
drop policy if exists v_rw on invoices; drop policy if exists v_own on invoices; drop policy if exists v_adm on invoices;
create policy v_own on invoices for all using(tech_id=auth.uid()) with check(tech_id=auth.uid());
create policy v_adm on invoices for all using(is_admin()) with check(is_admin());

-- ===== profils manquants + vérification =====
insert into profiles(id, full_name) select id, email from auth.users on conflict (id) do nothing;
select u.email, p.role, p.referral_code from auth.users u left join profiles p on p.id=u.id order by u.created_at;
