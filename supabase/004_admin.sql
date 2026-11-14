-- À exécuter APRÈS 003 : permet à un admin de changer le rôle des membres
create policy p_adm on profiles for update using(is_admin()) with check(is_admin());
