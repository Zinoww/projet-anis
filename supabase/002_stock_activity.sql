-- À exécuter APRÈS schema.sql
create table stock_items(id uuid primary key default gen_random_uuid(), barcode text not null, name text not null, qty int not null default 0 check(qty>=0), assigned_to uuid references profiles(id), created_at timestamptz default now());
create index on stock_items(assigned_to,barcode);
create table activity(tech_id uuid references profiles(id), day date, hours numeric not null default 0, km numeric not null default 0, fees numeric not null default 0, primary key(tech_id,day));
alter table stock_items enable row level security; alter table activity enable row level security;
create policy s_read on stock_items for select using(assigned_to=auth.uid() or is_admin());
create policy s_adm on stock_items for all using(is_admin()) with check(is_admin());
create policy a_rw on activity for all using(tech_id=auth.uid() or is_admin()) with check(tech_id=auth.uid() or is_admin());
create function use_stock(item uuid,n int) returns void language sql security definer set search_path=public as $$ update stock_items set qty=greatest(qty-n,0) where id=item and assigned_to=auth.uid() $$;
-- Démo : insert into stock_items(barcode,name,qty,assigned_to) select '3760000000017','Vanne 3 voies',5,id from profiles limit 1;
