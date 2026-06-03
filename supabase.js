/*
 * supabase.js — Supabase client init + shared helpers.
 *
 * 1. Load the Supabase library before this file:
 *      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *      <script src="supabase.js"></script>
 * 2. Fill in the two constants below from your Supabase project settings
 *    (Project Settings → API). The anon key is safe to expose publicly;
 *    all sensitive operations are guarded server-side by RLS + RPC functions.
 */

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // e.g. https://abcdxyz.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// The Supabase CDN script exposes a global named `supabase`. Make our client `sb`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/*
 * sha256Hex — SHA-256 of a string, returned as lowercase hex.
 * Matches Postgres `encode(digest(text, 'sha256'), 'hex')` so the admin secret
 * hashed here on creation compares equal to the server-side hash on close.
 */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Base URL of this deployment (directory containing the html files, trailing slash).
function siteBase() {
  const href = location.href.split('?')[0].split('#')[0];
  return href.substring(0, href.lastIndexOf('/') + 1);
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}
