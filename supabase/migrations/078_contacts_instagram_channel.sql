-- 078_contacts_instagram_channel.sql
-- Instagram DMs have no phone number — Meta identifies a sender by an
-- Instagram-Scoped ID (IGSID), a numeric string that's only valid
-- within this one Page's messaging context and is NOT a phone number.
-- Writing an IGSID into `phone` would corrupt phone-based dedup
-- (findExistingContact matches on last-8-digit suffix — real
-- collisions against real phone numbers would follow). This adds a
-- second, exact-match identity column instead of overloading `phone`.
--
-- Same one-contact-one-conversation model as today: an Instagram
-- sender becomes a new contact row (channel='instagram', phone=null,
-- instagram_id=set), parallel to how a new WhatsApp number works.
-- No cross-channel contact merging — there's no reliable shared
-- identifier between a phone number and an IGSID to merge on.

alter table contacts alter column phone drop not null;

alter table contacts
  add column if not exists instagram_id text,
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'instagram'));

create unique index if not exists idx_contacts_instagram_id
  on contacts (account_id, instagram_id)
  where instagram_id is not null;
