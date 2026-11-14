-- À exécuter APRÈS 002
alter table profiles add column referral_code text unique default upper(substr(md5(random()::text),1,6));
create table referrals(id uuid primary key default gen_random_uuid(), referrer_id uuid not null references profiles(id), kind text not null default 'demande' check(kind in('demande','installation')), created_at timestamptz default now());
create table documents(id uuid primary key default gen_random_uuid(), tech_id uuid not null references profiles(id), type text not null, title text not null, issued_on date, expires_on date, file_path text not null, created_at timestamptz default now());
create table billing_profiles(tech_id uuid primary key references profiles(id), company_name text, siret text, vat text, address text, iban text, bic text);
create table invoices(id uuid primary key default gen_random_uuid(), tech_id uuid not null references profiles(id), number text not null, client text not null, amount numeric not null default 0, status text not null default 'brouillon', created_at timestamptz default now());
alter table referrals enable row level security; alter table documents enable row level security; alter table billing_profiles enable row level security; alter table invoices enable row level security;
create policy r_read on referrals for select using(referrer_id=auth.uid() or is_admin());
create policy r_adm on referrals for all using(is_admin()) with check(is_admin());
create policy d_rw on documents for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid());
create policy b_rw on billing_profiles for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid());
create policy v_rw on invoices for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid());
insert into storage.buckets(id,name,public) values('documents','documents',false) on conflict do nothing;
create policy doc_rw on storage.objects for all to authenticated using(bucket_id='documents' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin())) with check(bucket_id='documents' and (storage.foldername(name))[1]=auth.uid()::text);
