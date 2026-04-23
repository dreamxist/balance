create table categories (
  id text primary key,
  name text not null,
  parent_id text references categories(id),
  entity entity_type not null default 'personal',
  sort_order int not null default 0
);

alter table categories enable row level security;

-- Categories are readable by any authenticated user (shared data)
create policy "categories_select" on categories
  for select to authenticated
  using (true);
