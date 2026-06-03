# SETUP — Community Preferential Voting

Step-by-step setup for the Supabase backend and GitHub Pages deployment.
Everything sensitive (verifying the admin secret, closing a vote, replacing a
ballot) happens **server-side** inside Postgres functions, so the public anon key
is safe to ship in `supabase.js`.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> and sign up (free tier is plenty).
2. Create a new project. Pick any name and a strong database password.
3. Wait for it to finish provisioning (~2 minutes).

---

## 2. Create the tables, functions, and policies

Open **SQL Editor** in the Supabase dashboard, paste the entire block below, and
click **Run**. It is idempotent enough to run on a fresh project.

```sql
-- Needed for SHA-256 hashing (digest()).
create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists votes (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  options           jsonb not null,        -- array of option name strings
  threshold         integer not null default 50,
  deadline          timestamptz,
  admin_secret_hash text not null,         -- SHA-256 (hex) of the raw admin secret
  status            text not null default 'open',  -- 'open' | 'closed'
  created_at        timestamptz not null default now()
);

create table if not exists ballots (
  id           uuid primary key default gen_random_uuid(),
  vote_id      uuid not null references votes(id) on delete cascade,
  voter_name   text not null,
  preferences  jsonb not null,             -- array of {option: string, rank: number}
  superseded   boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index if not exists ballots_vote_idx on ballots(vote_id);

-- ---------- row level security ----------
alter table votes   enable row level security;
alter table ballots enable row level security;

-- votes: anyone can read a vote (needed to load the voter/admin pages).
drop policy if exists votes_select_public on votes;
create policy votes_select_public on votes
  for select using (true);

-- votes: anyone can create a vote (the admin secret hash protects later edits).
drop policy if exists votes_insert_public on votes;
create policy votes_insert_public on votes
  for insert with check (true);

-- votes: no direct UPDATE/DELETE from the client. Closing happens via close_vote().

-- Hardening: never expose admin_secret_hash to the public anon key. RLS controls
-- *rows*, not *columns*; a table-wide SELECT grant would still leak every column.
-- So we drop the table-wide SELECT and grant SELECT on the safe columns only.
-- (INSERT is left table-wide so vote creation can still write admin_secret_hash.
--  The SECURITY DEFINER functions below run as the table owner and are unaffected.)
revoke select on votes from anon, authenticated;
grant select (id, title, description, options, threshold, deadline, status, created_at)
  on votes to anon, authenticated;

-- ballots: readable by the public ONLY once the parent vote is closed,
-- so voters can't peek at results early.
drop policy if exists ballots_select_when_closed on ballots;
create policy ballots_select_when_closed on ballots
  for select using (
    exists (select 1 from votes v where v.id = ballots.vote_id and v.status = 'closed')
  );

-- ballots: no direct INSERT/UPDATE from the client. Casting happens via cast_ballot().

-- ---------- functions (SECURITY DEFINER: run with table-owner rights) ----------

-- Cast (or re-cast) a ballot. Same voter_name + vote_id supersedes the prior ballot.
create or replace function cast_ballot(
  p_vote_id uuid, p_voter_name text, p_preferences jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v votes%rowtype;
  new_id uuid;
begin
  select * into v from votes where id = p_vote_id;
  if not found then raise exception 'vote not found'; end if;
  if v.status <> 'open' then raise exception 'vote is closed'; end if;
  if v.deadline is not null and v.deadline <= now() then
    raise exception 'voting deadline has passed';
  end if;

  -- Soft-replace any previous ballot from the same name.
  update ballots set superseded = true
    where vote_id = p_vote_id
      and lower(voter_name) = lower(p_voter_name)
      and superseded = false;

  insert into ballots (vote_id, voter_name, preferences)
    values (p_vote_id, p_voter_name, p_preferences)
    returning id into new_id;
  return new_id;
end; $$;

-- Verify the admin secret and close the vote. Returns true on success.
create or replace function close_vote(
  p_vote_id uuid, p_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare expected text; supplied text;
begin
  select admin_secret_hash into expected from votes where id = p_vote_id;
  if expected is null then return false; end if;
  supplied := encode(digest(p_secret, 'sha256'), 'hex');
  if supplied <> expected then return false; end if;
  update votes set status = 'closed' where id = p_vote_id;
  return true;
end; $$;

-- Return all ballots for a vote, but ONLY if the admin secret matches.
-- Lets the admin page show the live count while open and the CSV when closed.
create or replace function admin_get_ballots(
  p_vote_id uuid, p_secret text
) returns setof ballots
language plpgsql security definer set search_path = public as $$
declare expected text; supplied text;
begin
  select admin_secret_hash into expected from votes where id = p_vote_id;
  if expected is null then raise exception 'vote not found'; end if;
  supplied := encode(digest(p_secret, 'sha256'), 'hex');
  if supplied <> expected then raise exception 'access denied'; end if;
  return query select * from ballots where vote_id = p_vote_id order by submitted_at;
end; $$;

-- Allow the anon role to call the RPCs.
grant execute on function cast_ballot(uuid, text, jsonb)  to anon, authenticated;
grant execute on function close_vote(uuid, text)          to anon, authenticated;
grant execute on function admin_get_ballots(uuid, text)   to anon, authenticated;
```

> **Why functions instead of an Edge Function?** The spec allows either. Plain
> Postgres functions need no Docker, no CLI, and no separate deploy — you paste
> the SQL once and you're done. `SECURITY DEFINER` lets them bypass RLS for the
> exact, narrow operations we want, with the secret comparison done in the
> database where the client can never see the stored hash.

---

## 3. Get your API keys

In the dashboard go to **Project Settings → API** and copy:

- **Project URL** (e.g. `https://abcdxyz.supabase.co`)
- **anon public** key

Open `supabase.js` and fill them in:

```js
const SUPABASE_URL = 'https://abcdxyz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

The anon key is meant to be public — RLS and the functions above are what keep
things safe.

---

## 4. Put the site on GitHub Pages

1. Create a new GitHub repository and add these files at the repo **root**:
   `index.html`, `vote.html`, `admin.html`, `irv.js`, `supabase.js`,
   `README.md`, `SETUP.md`.
2. Commit and push to the `main` branch.
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Branch: `main`, folder: `/ (root)`. Save.
6. Wait a minute, then visit `https://<your-username>.github.io/<repo-name>/`.

The share/admin links the app generates are relative to wherever `index.html`
is served from, so they will automatically point at your Pages URL.

---

## 5. Test the full flow

1. Open the site, create a vote with 3+ options.
2. Copy the **voter link** and the **admin link** from the confirmation
   (the admin secret is shown only once — keep it).
3. Open the voter link in a couple of browsers/incognito windows and cast
   ballots with different names and rankings.
4. Re-cast a ballot with the **same name** — confirm the old one is replaced
   (the count in the admin panel shouldn't double).
5. Open the admin link, confirm the live vote count, then click
   **Close vote and publish results**.
6. Reload the voter link — results should now be visible with the
   round-by-round breakdown.
7. On the admin page, click **Download results as CSV** and check the file.

If results don't load on the voter page after closing, re-check the
`ballots_select_when_closed` policy and that the vote's `status` is `closed`.
