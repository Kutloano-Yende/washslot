-- WashSlot: car wash businesses, their booking books, and WhatsApp conversations.
--
-- Everything lives in its own schema, "washslot", so it can share a database with another app without
-- touching that app's tables. Supabase's public API only exposes the schemas listed in its API settings
-- (public by default), so this schema is not reachable through it.
--
-- Documents are stored as JSONB so the booking engine keeps working on plain objects, while the columns
-- we filter on (status, business_id, version) are real columns.
--
-- Security: row level security is ON with no policies for the public roles, so even if the schema were
-- exposed, anon and authenticated could read nothing. Only the server, using the database URL, can.
-- Clients' phone numbers are never stored: sender_hash is a salted hash, last4 is for display only.

create schema if not exists washslot;

create table if not exists washslot.businesses (
  id          text primary key,
  doc         jsonb not null,
  key_hash    text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  created_at  timestamptz not null default now()
);

create table if not exists washslot.ledgers (
  business_id text primary key,
  doc         jsonb not null,
  -- optimistic concurrency: an update only succeeds if nobody changed the row since it was read
  version     integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists washslot.conversations (
  sender_hash text primary key,
  last4       text not null,
  business_id text,
  doc         jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_business_idx on washslot.conversations (business_id, updated_at desc);

alter table washslot.businesses    enable row level security;
alter table washslot.ledgers       enable row level security;
alter table washslot.conversations enable row level security;
