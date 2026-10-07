-- Lessons tab (gated behind the lessons_tab feature flag, facility_features table).
-- Lessons reuse bulletin_posts end-to-end (signups, payments, calendar booking).
-- lesson_type records which Lessons-tab option created the post; NULL for
-- regular bulletin board posts. Custom types carry an admin-provided label.
ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS lesson_type VARCHAR(30)
    CHECK (lesson_type IN ('private_lesson', 'group_clinic', 'drill', 'custom')),
  ADD COLUMN IF NOT EXISTS lesson_type_label VARCHAR(60);
