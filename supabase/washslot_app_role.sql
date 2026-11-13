-- Supabase only (not part of the app's own migrations).
--
-- Gives WashSlot its own database user that can reach ONLY the washslot schema, so the app never needs the
-- project's master "postgres" password and cannot read the other app's tables in the same project.
--
-- After running this, set the user's password yourself in the Supabase SQL editor (never in chat):
--   alter role washslot_app with password 'a-long-random-password';
-- Then use the Session pooler connection string with this user:
--   postgresql://washslot_app.<project-ref>:<password>@<pooler-host>:5432/postgres

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'washslot_app') then
    create role washslot_app login;
  end if;
end $$;

grant usage on schema washslot to washslot_app;
grant select, insert, update, delete on all tables in schema washslot to washslot_app;
alter default privileges in schema washslot grant select, insert, update, delete on tables to washslot_app;
alter role washslot_app set search_path = washslot;

-- Row level security is on; this user needs an explicit policy to see rows. The public roles get none.
do $$
declare t text;
begin
  foreach t in array array['businesses', 'ledgers', 'conversations'] loop
    execute format('drop policy if exists washslot_app_all on washslot.%I', t);
    execute format('create policy washslot_app_all on washslot.%I for all to washslot_app using (true) with check (true)', t);
  end loop;
end $$;
