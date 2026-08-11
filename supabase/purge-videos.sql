-- One-time purge of every video already posted on the site.
--
-- Deletes:
--   · every video hype (public + private clips) — photo hypes stay
--   · their watch history + comments (cascade with the hype rows)
--   · group-chat posts that carried a clip
--   · the video files in the "hype" storage bucket
--
-- The posting features stay live — users can still upload videos after
-- this runs. Re-running is a no-op once the videos are gone.
--
-- Run it from the Supabase SQL Editor, or:
--   SUPABASE_PAT=<token> node scripts/purge-videos.mjs

-- 1) Group-chat video posts (they link to hype rows; delete first so a
--    leftover FK can never block the hype purge — the hype cascade would
--    cover it anyway).
delete from public.group_posts where video_url is not null;

-- 2) Video hypes only — image hypes (jpeg/png/gif/webp) are untouched.
--    hype_views and hype_comments cascade with their hype rows.
delete from public.hypes
where video_url ~ '\.(mp4|webm|ogg|mov|m4v|mkv|avi)(\?|$)';

-- 3) The clip files themselves (photos in the bucket stay).
delete from storage.objects
where bucket_id = 'hype'
  and lower(name) ~ '\.(mp4|webm|ogg|mov|m4v|mkv|avi)$';
