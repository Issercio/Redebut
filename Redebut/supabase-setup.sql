create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  name text not null,
  provider text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

drop policy if exists "read messages" on public.support_messages;
create policy "read messages"
on public.support_messages
for select
to anon
using (true);

drop policy if exists "insert messages" on public.support_messages;
create policy "insert messages"
on public.support_messages
for insert
to anon
with check (true);

create or replace function public.prune_support_messages(max_rows integer default 100)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  overflow_count integer;
begin
  if max_rows is null or max_rows < 1 then
    max_rows := 100;
  end if;

  select greatest(count(*) - max_rows, 0)
  into overflow_count
  from public.support_messages;

  if overflow_count <= 0 then
    return;
  end if;

  delete from public.support_messages
  where id in (
    select id
    from public.support_messages
    order by created_at asc, id asc
    limit overflow_count
  );
end;
$$;

revoke all on function public.prune_support_messages(integer) from public;
grant execute on function public.prune_support_messages(integer) to anon;
