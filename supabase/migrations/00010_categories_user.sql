-- Migration: Add user_id to categories for custom subcategories
-- Enables users to create their own categories while preserving shared defaults (user_id IS NULL)

-- 1. Add user_id column (nullable — NULL means shared/default category)
alter table categories add column user_id uuid references auth.users(id);

-- 2. Update RLS policies
-- Drop existing policy that allows all authenticated users to see everything
drop policy "categories_select" on categories;

-- Users see shared categories (user_id IS NULL) + their own
create policy "categories_select" on categories
  for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

-- Users can only insert their own categories
create policy "categories_insert" on categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Users can only update their own categories (not shared ones)
create policy "categories_update" on categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE policy: use delete_category function with transaction-reference check (D-07)

-- 3. create_subcategory function (CATG-02, CATG-04)
create or replace function create_subcategory(
  p_parent_id text,
  p_id text,
  p_name text
) returns categories as $$
declare
  v_parent categories;
  v_result categories;
begin
  -- Verify parent exists and is visible to user
  select * into strict v_parent from categories where id = p_parent_id;

  insert into categories (id, name, parent_id, entity, sort_order, user_id)
  values (
    p_id,
    p_name,
    p_parent_id,
    v_parent.entity,
    (select coalesce(max(sort_order), 0) + 1 from categories where parent_id = p_parent_id),
    (select auth.uid())
  )
  returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- 4. rename_category function (CATG-03, D-08 — always allowed for user's own)
create or replace function rename_category(
  p_category_id text,
  p_new_name text
) returns categories as $$
declare
  v_result categories;
begin
  update categories
  set name = p_new_name
  where id = p_category_id
    and user_id = (select auth.uid())
  returning * into v_result;

  if v_result is null then
    raise exception 'Category not found or not owned by user';
  end if;

  return v_result;
end;
$$ language plpgsql security definer;

-- 5. delete_category function (D-07 — blocked if transactions reference it)
create or replace function delete_category(p_category_id text)
returns void as $$
declare
  v_tx_count int;
begin
  -- Only allow deleting user's own categories
  if not exists (
    select 1 from categories
    where id = p_category_id
      and user_id = (select auth.uid())
  ) then
    raise exception 'Category not found or not owned by user';
  end if;

  -- Per D-07: block deletion if transactions reference this category
  select count(*) into v_tx_count
  from transactions
  where category = p_category_id;

  if v_tx_count > 0 then
    raise exception 'Cannot delete category with % associated transactions', v_tx_count;
  end if;

  -- Block if child categories exist
  if exists (select 1 from categories where parent_id = p_category_id) then
    raise exception 'Cannot delete category with subcategories';
  end if;

  delete from categories
  where id = p_category_id
    and user_id = (select auth.uid());
end;
$$ language plpgsql security definer;
