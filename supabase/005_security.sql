-- À exécuter APRÈS 004 : un technicien ne peut changer que le statut d'une intervention
create or replace function guard_intervention_update() returns trigger language plpgsql as $$
begin
  if not is_admin() and (new.assigned_to is distinct from old.assigned_to or new.client is distinct from old.client or new.scheduled_at is distinct from old.scheduled_at or new.address is distinct from old.address or new.city is distinct from old.city or new.ref is distinct from old.ref) then
    raise exception 'Modification non autorisée';
  end if;
  return new;
end $$;
drop trigger if exists guard_int on interventions;
create trigger guard_int before update on interventions for each row execute function guard_intervention_update();
