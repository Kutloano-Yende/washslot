-- WashSlot: car wash businesses, their booking books, and WhatsApp conversations.
--
-- Documents are stored as JSONB so the booking engine keeps working on plain objects, while the columns
-- we filter on (status, business_id, version) are real columns.
--
-- Security: row level security is ON with no policies. Supabase's public (anon) API therefore cannot read
-- or write any of this; only the server, which connects with the database URL, can. Clients' phone numbers
-- are never stored: sender_hash is a salted hash, last4 is for display only.

create table if not exists businesses (
  id          text primary key,
  doc         jsonb not null,
  key_hash    text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  created_at  timestamptz not null default now()
);

create table if not exists ledgers (
  business_id text primary key,
  doc         jsonb not null,
  -- optimistic concurrency: an update only succeeds if nobody changed the row since it was read
  version     integer not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists conversations (
  sender_hash text primary key,
  last4       text not null,
  business_id text,
  doc         jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_business_idx on conversations (business_id, updated_at desc);

alter table businesses    enable row level security;
alter table ledgers       enable row level security;
alter table conversations enable row level security;
