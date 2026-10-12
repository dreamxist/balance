-- Habits that measure themselves. Sleep, wake time and steps are read on the phone from
-- Apple Health and never stored here: Health data does not leave the device. This table
-- only keeps the rule (kind + target); manual habits keep their marks in life_habit_days.
--
-- kind     target
-- manual   null                 marked by hand
-- sleep    hours asleep (7)     done when the night reaches it
-- wake     hour of day (9)      done when the main sleep ends before it
-- steps    steps (10000)        done when the day reaches it

alter table life_habits
  add column kind text not null default 'manual'
    check (kind in ('manual', 'sleep', 'wake', 'steps')),
  add column target numeric
    check ((kind = 'manual') = (target is null));

-- Only manual habits take marks by hand.
create function life_habit_days_manual_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select kind from life_habits where id = new.habit_id) <> 'manual' then
    raise exception 'This habit is measured by Apple Health on the phone; it is not marked by hand'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger life_habit_days_manual_only
  before insert on life_habit_days
  for each row execute function life_habit_days_manual_only();
