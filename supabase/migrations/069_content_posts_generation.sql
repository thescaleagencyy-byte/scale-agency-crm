-- 069_content_posts_generation.sql
-- Marketing OS v2 (freemium): adds fields for AI-generated content —
-- hashtags and a thumbnail image URL. Image generation uses
-- Pollinations.ai (free, no API key, no account) rather than a paid
-- image-gen API — the "freemium" scope Umer asked for. Still no
-- social platform API connected: generated posts land as drafts in
-- the existing content_posts calendar, same honesty as v1.

alter table content_posts
  add column if not exists hashtags text,
  add column if not exists image_url text;

notify pgrst, 'reload schema';
