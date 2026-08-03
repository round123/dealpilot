-- Purge jobs intentionally survive Customer deletion, but they must not survive
-- deletion of the owning account.
alter table public.customer_purge_jobs
  add constraint customer_purge_jobs_owner_fkey
  foreign key (owner_user_id)
  references public.profiles(id)
  on delete cascade
  not valid;

alter table public.customer_purge_jobs
  validate constraint customer_purge_jobs_owner_fkey;

create index if not exists customer_purge_jobs_owner_idx
  on public.customer_purge_jobs (owner_user_id);
