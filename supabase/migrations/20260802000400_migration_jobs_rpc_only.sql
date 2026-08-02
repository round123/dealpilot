-- Migration sessions are mutated only by their SECURITY DEFINER RPCs. Revoke
-- every direct table-write capability, including privileges inherited from
-- PUBLIC and the elevated service role.
revoke insert, update, delete, truncate, references, trigger
on table public.migration_jobs
from public, anon, authenticated, service_role;
