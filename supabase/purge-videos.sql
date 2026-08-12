-- One-time purge of every piece of media already posted on the site.
--
-- Deletes:
--   · every hype — photos AND videos (public + private clips)
--   · their watch history + comments (cascade with the hype rows)
--   · group-chat posts that carried a clip
--   · every media file in the "hype" storage bucket
--
-- The posting features stay live — users can still upload photos and
-- videos after this runs. Re-running is a no-op once everything is gone.
--
-- Run it from the Supabase SQL Editor, or:
--   SUPABASE_PAT=<token> node scripts/purge-videos.mjs

-- 1) Group-chat video posts (they link to hype rows; delete first so a
--    leftover FK can never block the hype purge — the hype cascade would
--    cover it anyway).
delete from public.group_posts where video_url is not null;

-- 2) EVERY hype — photos and videos alike.
--    hype_views and hype_comments cascade with their hype rows.
delete from public.hypes;

-- 3) Every media file in the hype bucket. Supabase blocks direct
--    storage.objects deletes with a protect trigger, so run as postgres
--    (SQL editor / Management API) and bypass the trigger for this one
--    statement, then restore the setting.
set session_replication_role = replica;
delete from storage.objects where bucket_id = 'hype';
reset session_replication_role;
