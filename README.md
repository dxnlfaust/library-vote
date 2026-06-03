# Community Preferential Voting 🗳

A lightweight **Instant-Runoff Voting (IRV)** web app for a community library —
the same preferential system used in Australian federal elections. Static
frontend on **GitHub Pages**, **Supabase** (Postgres) for storage.

It deliberately looks like a university IT department built it in 2001: Times
New Roman, blue underlined links, default buttons, `<hr>` dividers. No
frameworks, no build step.

## How it works

- **Create** a vote on the home page. Add options by hand or import a column
  from a public Google Sheet. You get a public **voter link** and a private
  **admin link** (the admin secret is shown exactly once).
- **Voters** rank options 1, 2, 3… (ranking all of them is optional). Options
  are shuffled per voter to avoid order bias. Re-voting under the same name
  replaces your previous ballot.
- **Closing** the vote (admin only) publishes the results. The IRV count runs
  client-side from the raw ballots: lowest option is eliminated each round and
  its votes transfer to the next preference until one option exceeds the win
  threshold.

## Files

| File | Purpose |
|---|---|
| `index.html` | Create a vote (+ Google Sheet import, how-it-works) |
| `vote.html`  | Voter page — cast a ballot / view published results |
| `admin.html` | Admin panel — live count, close vote, results, CSV export |
| `irv.js`     | IRV algorithm + results renderer (shared) |
| `supabase.js`| Supabase client init + SHA-256 helper (shared) |
| `SETUP.md`   | Supabase SQL + RLS + GitHub Pages deploy, step by step |

## Setup

See **[SETUP.md](SETUP.md)**. In short: create a Supabase project, run the
provided SQL (tables + RLS + three `SECURITY DEFINER` functions), paste your
project URL and anon key into `supabase.js`, and serve the repo root via GitHub
Pages.

## Security model

- The anon key is public by design. Row Level Security limits the client to:
  reading votes, creating votes, and reading ballots **only after a vote is
  closed**.
- The three sensitive operations go through Postgres functions instead:
  `cast_ballot` (handles same-name supersede), `close_vote` (verifies the admin
  secret server-side via SHA-256), and `admin_get_ballots` (secret-gated ballot
  access for the live count and CSV).
- The admin secret is a `crypto.randomUUID()` generated in the browser; only its
  SHA-256 hash is ever stored. It cannot be recovered — keep the admin link safe.

## Out of scope

Email notifications, voter login, editing a vote after creation, multiple
admins, and (regrettably) an animated GIF hit counter.
