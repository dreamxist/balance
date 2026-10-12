-- Any habit can be marked by hand. For habits measured on the phone (wake, steps, sleep)
-- a mark is the user's word that it happened when Health has no reading or got it wrong;
-- the habit counts as done if Health says so or if it was marked. Still no Health data
-- is stored here: a mark is only "done that day".

drop trigger life_habit_days_manual_only on life_habit_days;
drop function life_habit_days_manual_only();
