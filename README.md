# Shantay You Play

A Drag Race–style weekly competition for a group of friends. Judges (*jurado*) publish a weekly category and upload each contestant's runway look; then everyone votes for their Top 3.

**Stack:** Nuxt 4 (TypeScript) · Supabase (Postgres, Auth, Storage) · `@nuxtjs/supabase` · Google OAuth · pnpm

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.15.0+** (LTS) | Enforced by `engines` in `package.json` + `engine-strict` in `.npmrc`. `.nvmrc` pins `24.15.0` (`nvm use`). Check with `node -v`. |
| pnpm | **9.15.9** | Pinned in `package.json` → `packageManager`. Run `corepack enable` and Corepack will pick the right version automatically. |
| Supabase account | — | https://supabase.com (free tier is enough) |
| Google Cloud account | — | For the OAuth client used by "Entrar con Google" |

The Supabase CLI does not need a global install; it runs through `pnpm dlx supabase …`.

---

## Quick start

```bash
git clone https://github.com/NamastechLabs/shantay-you-play.git
cd shantay-you-play
corepack enable          # once per machine, makes pnpm available at the pinned version
pnpm install
cp .env.example .env     # then fill in the values (see below)
pnpm dev                 # http://localhost:3000
```

Before the app works end to end you need to complete the three setup steps below: **Supabase project → migrations → Google OAuth**.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server on http://localhost:3000 |
| `pnpm dev:local` | Same, but against the local Supabase from `.env.local` (see [Local test database](#local-test-database)) |
| `pnpm db:start` / `db:stop` | Start / stop the local Supabase stack (needs Docker) |
| `pnpm db:reset` | Re-apply all migrations and `supabase/seed.sql` to the local DB |
| `pnpm tunnel:api` / `tunnel:app` | Cloudflare tunnels to the local Supabase API (54321) / the app (3000), for [phone debugging](#debugging-the-local-database-on-a-phone) |
| `pnpm build` | Production build (`.output/`) |
| `pnpm preview` | Serve the production build locally |
| `pnpm typecheck` | Type-check the whole project with `vue-tsc` |

---

## 1. Supabase project

1. Create a project at https://supabase.com/dashboard. Save the **database password**; the CLI asks for it when pushing migrations.
2. Go to **Project Settings → API Keys** (or **Data API**) and copy:
   - the **Project URL** (`https://<project-ref>.supabase.co`)
   - the **publishable / anon** key (never the secret / `service_role` key)
3. Put them in `.env`:

   ```dotenv
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_KEY=<publishable-or-anon-key>
   ```

`.env` is git-ignored. Never commit real keys.

---

## 2. Database migrations

All schema changes live in [`supabase/migrations/`](supabase/migrations) and are applied in timestamp order:

| Migration | Contents |
|---|---|
| `20261101000000_init_schema.sql` | `participants`, `categories`, `looks`, `votes`, enums, indexes, triggers, RLS policies, auto-create profile on sign-up |
| `20261101000100_storage_runway_looks.sql` | Public `runway-looks` storage bucket + judge-only upload policies |
| `20261101000200_grant_table_privileges.sql` | Explicit table `GRANT`s for the `authenticated` role |
| `20261101000300_add_participants_drag_name.sql` | `participants.drag_name` (unique, case-insensitive) |
| `20261102000000_participants_preregistration.sql` | `participants.user_id`: judges pre-register people by email and the first Google sign-in links to them; ownership rules now go through `current_participant_id()` |
| `20261102001400_runways.sql` | `runways` (week, date, status) group 1..N categories; status and week move off `categories`; ballots become a Top 3 of **queens** per runway (existing ballots are converted); `runway_top_three` / `runway_ranking` |
| `20261102001500_runway_datetime.sql` | `runways.runway_date` becomes `timestamptz` (date and time of the runway) |
| `20261102001600_look_intro_1000.sql` | Jury look intro limit raised from 500 to 1000 characters |

### Apply them with the Supabase CLI (recommended)

```bash
pnpm dlx supabase login                              # opens the browser once
pnpm dlx supabase link --project-ref <project-ref>   # the xxxx in https://xxxx.supabase.co
pnpm dlx supabase db push --dry-run                  # preview what will run
pnpm dlx supabase db push                            # apply (asks for the DB password)
```

The CLI records applied migrations, so `db push` only runs new ones.

### Alternative: SQL Editor

Paste each file, **in order**, into **Dashboard → SQL Editor → New query** and run it. If you later switch to the CLI, mark them as applied so they aren't run twice:

```bash
pnpm dlx supabase migration repair --status applied 20261101000000 20261101000100 20261101000200 20261101000300
```

### Creating a new migration

```bash
pnpm dlx supabase migration new <short_description>   # creates supabase/migrations/<timestamp>_<short_description>.sql
# write the SQL, then:
pnpm dlx supabase db push
```

Conventions (see [CLAUDE.md](CLAUDE.md)): lowercase `snake_case`, `uuid` PKs with `gen_random_uuid()`, `timestamptz`, explicit FKs and indexes, RLS on every table, and an explicit `GRANT` for any new table (this project does **not** auto-grant tables to `anon`/`authenticated`).

### Regenerate TypeScript types

After any schema change, regenerate [`app/types/database.types.ts`](app/types/database.types.ts) so queries stay type-safe:

```bash
pnpm dlx supabase gen types typescript --linked > app/types/database.types.ts
pnpm typecheck
```

---

## 3. Google OAuth

### 3.1 Google Cloud Console

1. Open https://console.cloud.google.com and create (or select) a project.
2. Go to **Google Auth Platform** and click **Get started**:
   - **App information:** app name (e.g. `Shantay You Play`) and support email
   - **Audience:** **External**
   - **Contact information:** your email
   - **Finish:** accept the policy → **Create**
3. **Clients → + Create client:**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000` (+ your production URL later)
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** (the secret may only be shown once).
5. **Audience:** while the app is in *Testing*, only listed **Test users** can sign in. Add your friends' Gmail addresses, or click **Publish app** (no review needed for the basic `email`/`profile`/`openid` scopes).

### 3.2 Supabase dashboard

1. **Authentication → Sign In / Providers → Google:** enable it, paste the Client ID and secret, save.
2. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:3000` (your production URL once deployed)
   - **Redirect URLs:** add `http://localhost:3000/confirm` (and `https://<your-domain>/confirm` in production)

Now `http://localhost:3000/login` → **Entrar con Google** should land you on onboarding (drag name) and then the home page.

---

## Roles

Judges register participants (name + Google email, optional drag name) in **/admin/participants** before they ever sign in. The first Google sign-in with that email links the login to the registered record (trigger `handle_new_user`); judges can upload their looks in the meantime. Sign-up is restricted: a first sign-in with an email that isn't registered (or isn't verified by the provider) is rejected by `handle_new_user` and no login is created.

**Bootstrapping the first judge:** since nobody can sign up unregistered, insert the first judge in the **SQL Editor** before they sign in:

```sql
insert into public.participants (name, email, role) values ('Name', 'judge@example.com', 'jurado');
```

Judges can't be self-assigned from the app, and a person's role can't be changed after registering them (only at registration time). To promote someone later, use the **SQL Editor**:

```sql
update public.participants set role = 'jurado' where email = 'someone@gmail.com';
```

| Role | Can do |
|---|---|
| `jurado` | Everything a contestant can, plus create/edit runways and their categories, change the runway status, upload looks |
| `concursante` | See non-draft runways, categories and looks, vote a Top 3 of queens per runway during `voting` (never for themself) |

A **runway** is one week (date and time + status) with one or more **categories**; each queen uploads one look per category and voters rank a Top 3 of queens for the whole runway. Runway lifecycle: `draft` → `werk_room` → `runway` → `voting` → `reveal` → `closed`. During `reveal` the homepage animates the Top 3 (via the `runway_top_three` function); individual votes are visible to everyone once a runway is `closed`.

**Group categories:** a category can be `individual` (default) or `group`. A group category has exactly two groups, and the judges assign `concursante`s to them from **Editar grupos** in the admin (a queen is in one group per category). Voting is separate from the runway Top 3 and has three phases: judges vote the winning band (a draw makes both win), each queen ranks **all** the queens of the rival band, and each judge ranks **all** the contestants. Ballots go through `submit_ranking_ballot`; the final ranking adds both normalized averages (50/50) plus a 0.2 bonus for the winning band. Each group also has up to 4 landscape photos (16:9 or 5:3) shown together; members upload them during `werk_room` and judges until voting opens. Results come from `category_group_result` and `category_ranking_result`, public from `reveal`. A plain-language explanation lives at `/votacion-bandas`. Details in [docs/group-categories.md](docs/group-categories.md). The help page sections can be linked directly: `/help#categorias-grupales` (also `#juego`, `#roles`, `#etapas`, `#puntos`, `#seguridad`, `#dudas`).

**Sharing your look ("A desfilar"):** while a runway is in `runway` (pasarela), each `concursante` sees an **A desfilar** button in the homepage hero card. It shares her own look for the week (all its photos, front/back/reveal/extra, plus the intro) through the native share sheet so she can post it in the WhatsApp group where everyone comments. If the week has several categories, each intro is prefixed with its category title. A `concursante` in a group category also gets **A desfilar con mi banda**, which shares her own band's name, intro and photos the same way (not shown to the jury). Implemented in [`useShareLooks`](app/composables/useShareLooks.ts) with the Web Share API (level 2, files):

- Needs **HTTPS** (or `localhost`) and a user tap. Supported in Chrome on Android and Safari on iOS.
- The photos are downloaded when the page loads (`prefetch`), because browsers only allow `navigator.share` right after a tap.
- The photos are fetched with `fetch`, so the `runway-looks` bucket must be reachable cross-origin (public Supabase buckets send permissive CORS headers).
- Where file sharing isn't supported (most desktop browsers) the intro text is copied to the clipboard and a message says so.
- WhatsApp may attach the text to only the first photo, or drop it, when several photos are shared. That is WhatsApp's behavior, not the app's.

---

## Local test database

Friends use the live Supabase project, so test status changes (Werk Room → Runway → Voting → Reveal → Closed) against a local copy instead. Needs Docker Desktop.

1. `pnpm db:start` (first run pulls the Docker images). It applies every migration and `supabase/seed.sql`.
2. Create `.env.local` from the output of `pnpm dlx supabase status -o env`:

   ```
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_KEY=<PUBLISHABLE_KEY>
   NUXT_SUPABASE_SECRET_KEY=<SECRET_KEY>
   ```

3. `pnpm dev:local` runs the app against the local DB. Plain `pnpm dev` keeps using `.env` (live).
4. Sign in with email and password, or use the "Dev: entrar como…" widget. Every seeded account uses the password `password123` and a fake `@local.test` email (the first name of the real participant): jurados `fran@` and `carlos@`; concursantes `participante@`, `daniel@`, `toni@`, `victor@`, `luis@`, `matthew@` and `paula@`; special guest `carol@`.
5. The seed is a snapshot of the live data (same participants, runways, looks, groups and votes; only emails and logins are faked). Sign in as a jurado and use `/admin` to move a runway to any status.
6. `pnpm db:reset` restores the seed data. `pnpm db:stop` shuts it down. Studio is disabled by default; remove `studio` from the `-x` list in `db:start` to get it on http://127.0.0.1:54323.

### Debugging the local database on a phone

The phone cannot reach `127.0.0.1`, so tunnel both the app and the Supabase API. Run each command in its own terminal, in this order:

0. `pnpm db:start` (skip if the local stack is already running).
1. `pnpm tunnel:api` → copy its `https://….trycloudflare.com` URL into `SUPABASE_URL` in `.env.local`.
2. Add `NUXT_DEV_ALLOW_TUNNEL=true` to `.env.local` (lets the "Dev: entrar como…" widget answer through a tunnel; never set it against the live project).
3. `pnpm dev:local`, then `pnpm tunnel:app` and open that URL on the phone.

Restart `pnpm dev:local` whenever the API tunnel URL changes.

Google/Azure sign-in does not work locally (no provider configured), and the seed photos are loaded from picsum.photos, so you need internet to see them.

---

## Testing on a phone (Cloudflare Tunnel)

The share sheet only works over HTTPS, so a plain LAN IP (`http://192.168.x.x:3000`) won't do. A Cloudflare quick tunnel exposes your local dev server on a public HTTPS URL. No Cloudflare account is needed.

1. **Install** `cloudflared` once:

   ```powershell
   winget install Cloudflare.cloudflared      # Windows
   brew install cloudflared                   # macOS
   ```

2. **Start the dev server and the tunnel**, in two terminals:

   ```bash
   pnpm dev
   cloudflared tunnel --url http://localhost:3000
   ```

   `cloudflared` prints a URL like `https://random-words.trycloudflare.com`. It changes every time the tunnel restarts. Open it on your phone.

3. **Vite host check:** [`nuxt.config.ts`](nuxt.config.ts) already sets `vite.server.allowedHosts: ['.trycloudflare.com']`, so any `*.trycloudflare.com` host is accepted. Without it the phone shows *"Blocked request. This host … is not allowed"*. Restart `pnpm dev` after changing that setting; it is only read at startup. If you use another tunnel (ngrok, VS Code dev tunnels), add its domain there too.

4. **Allow the tunnel in Supabase** (one time). In **Authentication → URL Configuration → Redirect URLs** add:

   ```
   https://*.trycloudflare.com/**
   ```

   The app builds `redirectTo` from the current origin ([`useAuth.ts`](app/composables/useAuth.ts)), so Supabase must accept the tunnel host. The wildcard covers every new tunnel URL. Leave **Site URL** as it is. Remove the wildcard when you finish testing: it lets any trycloudflare tunnel receive your auth redirects.

5. **Google / Microsoft (Azure) need no change.** The providers only redirect to the fixed Supabase callback (`https://<project-ref>.supabase.co/auth/v1/callback`), which is already registered. Never add the tunnel URL in the Google or Azure consoles.

**Skipping login on the phone:** in dev, the "Dev: entrar como…" widget ([`DevImpersonate.vue`](app/components/DevImpersonate.vue)) signs you in as any participant without OAuth. It needs `NUXT_SUPABASE_SECRET_KEY` in `.env`. While a tunnel is open, anyone with the URL can reach that dev server, so keep it short-lived.

**Android only, no tunnel:** connect the phone by USB, open `chrome://inspect#devices`, add port forwarding `3000 → localhost:3000`, and open `http://localhost:3000` on the phone. Chrome treats it as a secure context, so the share sheet works.

---

## Commentary endpoint (AI)

`GET /api/commentary/runway` returns the runway in the **Pasarela** stage with its categories, each queen's intro and photo URLs (plus the jury's looks), so an AI can write the commentary without pasting photos by hand. `?week=N` selects another week. The project skill [`runway-commentary`](.claude/skills/runway-commentary/SKILL.md) calls it and downloads the photos.

1. Apply the migration `20261108000000_service_role_read_runway_looks.sql` (read grants for `service_role`).
2. Set `NUXT_COMMENTARY_API_TOKEN` (and `NUXT_SUPABASE_SECRET_KEY`) on the server that runs the app. With no token the route answers 404.
3. Call it with `Authorization: Bearer <token>`. Photo URLs are public, no auth needed.

The route reads with the service-role key, which bypasses RLS: keep the token secret and only enable it where you accept that key.

---

## Project structure

```
app/
  pages/          login, confirm (OAuth callback), onboarding (drag name), index
  middleware/     drag-name.global.ts: forces onboarding until drag_name is set
  composables/    useCurrentParticipant, useLookUpload, useShareLooks (native share of a queen's look), useGroupPhotos (group photo upload)
  utils/          compressImage (client-side resize → WebP), toErrorMessage, groupPhotos (landscape ratio check)
  types/          database.types.ts (generated Supabase types)
supabase/
  migrations/     SQL migrations (source of truth for the schema)
  config.toml     Supabase CLI config
nuxt.config.ts    @nuxtjs/supabase config (auth redirects, types path)
```

Runway photos are resized to max 1600px and re-encoded as WebP in the browser before upload, then stored at `runway-looks/{category_id}/{participant_id}/{uuid}.webp`. Group photos use the same bucket under `runway-looks/{category_id}/{group_id}/{uuid}.webp`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unsupported provider: provider is not enabled` | Google provider not enabled in Supabase → step 3.2 |
| Google shows `redirect_uri_mismatch` | The redirect URI in Google must be `https://<project-ref>.supabase.co/auth/v1/callback` |
| Google shows "Access blocked: app has not completed verification" | Add the account under **Audience → Test users**, or publish the app |
| After login you land on the Site URL instead of `/confirm` | Add `http://localhost:3000/confirm` to Supabase **Redirect URLs** |
| `permission denied for table …` | A migration is missing: run `pnpm dlx supabase db push`. New tables need an explicit `GRANT` |
| `Missing NUXT_PUBLIC_SUPABASE_URL` warning | `.env` is missing or empty → section 1 |
| Tunnel URL shows `Blocked request. This host … is not allowed` | Host missing from `vite.server.allowedHosts` in `nuxt.config.ts`; restart `pnpm dev` after editing |
| Login through the tunnel ends on `localhost` | Add `https://*.trycloudflare.com/**` to Supabase **Redirect URLs** |
| "A desfilar" shows a download error | The look photos can't be fetched cross-origin: check the `runway-looks` bucket is public / CORS |
| `pnpm: command not found` (e.g. after upgrading Node) | Run `corepack enable` (on Windows, from an admin terminal if it fails with `EPERM`), or prefix commands with `corepack`, e.g. `corepack pnpm dev` |
| `Unsupported engine` error from pnpm | Upgrade Node to 24.15.0+ (`nvm install` reads `.nvmrc`) |
