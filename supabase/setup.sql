-- Run once in the Supabase SQL Editor. Safe to run again: no tracker data is deleted.
begin;
create table if not exists public.tasktracker_documents (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.tasktracker_documents enable row level security;
revoke all on public.tasktracker_documents from anon, authenticated;
grant select on public.tasktracker_documents to authenticated;
drop policy if exists "Read own tracker" on public.tasktracker_documents;
create policy "Read own tracker" on public.tasktracker_documents for select to authenticated
  using ((select auth.uid()) = owner_id);

-- The only client write path. Compare-and-swap is atomic, including first creation.
create or replace function public.save_tasktracker(expected_revision bigint, tracker_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  saved public.tasktracker_documents;
begin
  if current_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0
     or jsonb_typeof(tracker_document) is distinct from 'object'
     or tracker_document->>'version' is distinct from '1'
     or jsonb_typeof(tracker_document->'tasks') is distinct from 'array'
     or jsonb_typeof(tracker_document->'projects') is distinct from 'array'
     or octet_length(tracker_document::text) > 16777216 then
    raise exception 'invalid_tracker_document' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.tasktracker_documents(owner_id, document) values(current_user_id, tracker_document)
      on conflict (owner_id) do nothing returning * into saved;
  else
    update public.tasktracker_documents set document = tracker_document, revision = revision + 1, updated_at = now()
      where owner_id = current_user_id and revision = expected_revision returning * into saved;
  end if;
  if saved.owner_id is null then raise exception 'revision_conflict' using errcode = '40001'; end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_tasktracker(bigint, jsonb) from public, anon;
grant execute on function public.save_tasktracker(bigint, jsonb) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasktracker_documents'
  ) then alter publication supabase_realtime add table public.tasktracker_documents; end if;
end $$;
commit;
