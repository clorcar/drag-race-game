# Group categories

Status: **implemented** (DRG-5, released in 0.2.0; ranking votes in DRG-8). Migrations: `20261111000000_group_categories.sql`, `20261111000100_group_photos.sql`, `20261113000000_group_intro.sql`, `20261114000000_group_ranking_votes.sql` and `20261114000100_runway_reveal_stage.sql`.

## Goal

Some weeks have a category that is played by teams ("bands" in the UI). The queens are spread in two groups that compete collectively and also individually, on top of the usual runway Top 3.

## Rules

| Topic | Rule |
|---|---|
| Category type | `categories.kind`: `individual` (default) or `group`. |
| Groups | A group category has exactly two groups (position 1 and 2). Judges name them and assign `concursante`s; a queen is in one group per category. |
| Phase 1: band vote | Only judges vote, one band each. The band(s) with the most votes win; **on a draw both bands win**. |
| Phase 2: cross vote | Each contestant ranks **all** the members of the **rival** band, best to worst. The ballot must be complete. |
| Phase 3: jury runway | Each judge ranks **all** the contestants in bands, best to worst. The ballot must be complete. |
| Final ranking | `weight_cross * cross_score + weight_jury * jury_score + band_bonus` (see below). Public from `reveal`; ballots stay private until `closed`. |
| Runway Top 3 | Unchanged. Group votes are separate tables and do not add points to it. |

A group category cannot go back to `individual` while it has groups (trigger `protect_category_kind`).

## Ranking votes and points (DRG-8)

Bands may have a different number of members: nothing assumes 3 per band. Only `rank` is stored, and points are computed when reading, normalized so bands of any size are comparable.

- Value of one vote = `(N - rank + 1) / N`, with `N` = candidates on that ballot (the favourite always weighs 1). `cross`: `N` is the rival band size; `jury`: `N` is the number of contestants.
- `cross_score` = **average** of that value over the voters of the rival band who voted. `jury_score` = average over the judges who voted.
- `band_bonus` = `band_bonus_value` for every member of a band that won phase 1 (`category_group_result.is_winner`), otherwise 0. If both bands win on a draw, both get it.
- `total = weight_cross * cross_score + weight_jury * jury_score + band_bonus`. Maximum with the current values: 1.2.
- **Constants** (now `0.5`, `0.5` and `0.2`) are at the top of `category_ranking_result` (last defined in `20261114000100_runway_reveal_stage.sql`) and mirrored in `app/utils/groupRanking.ts`, which feeds the help page `/votacion-bandas`. To change them: a new migration that replaces the function **and** an edit of `groupRanking.ts`, then review the worked example of the help page (it is recomputed from the constants). 40/60 is `0.4`/`0.6`; a `0.4` bonus is roughly the +6 points of the original simulation; `0` leaves phase 1 as a tie-break only.
- **Order of `position`**: `total` descending; then the contestant of the winning band; then higher `jury_score`; if still tied they share the position (`rank()`). Scores are rounded to 6 decimals so equal fractions compare as equal.
- **Display**: the UI shows `cross_score`, `jury_score`, `band_bonus` and `total` as the database returns them, with 3 decimals (`0,667`), never rounded to whole numbers. The order always comes from `position`.

### Database

- Enum `ranking_stage` (`cross`, `jury`).
- `category_ranking_votes`: one row per ranked candidate (`category_id`, `stage`, `voter_id`, `participant_id`, `rank`). Unique per `(category, stage, voter, rank)` and `(category, stage, voter, participant)`; a voter cannot rank herself. Only group categories accept rows (trigger `enforce_group_category`).
- RLS: `select` only. You always see your own ballot; everyone's once the category is `closed`. There are **no insert/update/delete grants**.
- `submit_ranking_ballot(category_id, stage, participant_ids[])` (`SECURITY DEFINER`, `authenticated` only): validates and replaces the caller's ballot in one transaction; `rank` is the position in the array. It requires a group category in `voting`; `cross` needs a `concursante` in a band and exactly the rival band; `jury` needs a `jurado` and exactly all the contestants in bands. Anything incomplete, duplicated or foreign raises (`42501` not allowed or voting closed, `22023` invalid ballot).
- `category_ranking_result(category_id)` (`SECURITY DEFINER`, `stable`): `participant_id`, `group_id`, `cross_score`, `jury_score`, `band_bonus`, `total`, `position`. Empty before `reveal`.
- `category_queen_votes` and `category_queen_result` (the old Top 1) stay as legacy and are no longer used by the app. Old votes are not migrated: they only hold a Top 1, so they cannot be a complete ballot.

### Staged reveal

A runway with a group category is revealed in two stages while it is in `reveal`:

1. **Winning band** (homepage): `BandReveal.vue` runs the same effect as the Top 3 reveal (roulette between the two bands, winner with crown and confetti); on a draw both win at once, without roulette. The band comes from `category_group_result`, which is public from `reveal`. Once it ends, only a **judge** sees the button "Revelar el Top 3 de la semana"; everyone else sees a waiting message.
2. **Top 3 of the week**: the button calls `reveal_runway_top_three(runway_id)`, which sets `runways.top_three_revealed`. Everyone (through the existing realtime refresh) gets `TopThreeReveal`, while the winning band slides down below it and takes the full width (the losing band collapses; on a draw both winners share the width). It is the same `BandReveal` instance in both stages (`compact` prop), and the slide is a FLIP animation in `index.vue`; reduced-motion users get no animation. When `TopThreeReveal` emits `done` (second and third are in) the homepage shows a "Ver la pasarela" button, for every runway in `reveal`.

The stage is gated **in the database**, not only on screen: `runway_results_visible(runway_id)` is true when the runway is `closed`, or in `reveal` with `top_three_revealed` set, or in `reveal` when it has **no** group category (those runways are not staged). `runway_top_three` and `category_ranking_result` return nothing until then, so the winner cannot be read early from the API or from the runway page (which refetches its group results when the flag flips). The flag resets whenever the status changes (trigger `runways_reset_top_three_revealed`), so reopening a reveal starts clean. `reveal_runway_top_three` is judge-only and requires the status `reveal`.

Bands always need at least one photo for the reveal: a band without one is skipped (a future admin rule will require it).

### Sharing the band ("A desfilar con mi banda")

While the runway is in `runway`, a `concursante` who belongs to a band sees a second button next to "A desfilar" on the homepage. It shares **her own band's** name, intro and photos through the same native share sheet (`useShareLooks`), so she can post it in the WhatsApp group. It is not shown to the jury (judges and special guests) and not to queens without a band. Data: `loadMyGroup` in `app/pages/index.vue` (membership, `category_groups.name/intro` and `category_group_photos`; members always read their own band). With neither intro nor photos there is nothing to share and the button is hidden. Desktop browsers only copy the text.

### Voting steps

The vote page (`/runways/[id]/vote`) guides voters through the ballots of a group category with a stepper (`.stepper--free` in `_stepper.scss`). Navigation is free (no gating); a step shows a check once its ballot is saved, and the current step lives in the URL (`?paso=2`). The stepper (`VoteStepper.vue`) is shown at the top and, on phones only (below 48rem), repeated under the step so you do not scroll back up.

| Role | Steps |
|---|---|
| Jury | 1. Best band (phase 1) · 2. Order all the queens (phase 3) · 3. Top 3 of the week |
| Contestant in a band | 1. Order the rival band (phase 2) · 2. Top 3 of the week |
| Contestant without a band, or a runway without group categories | Only the Top 3, no stepper |

The jury's Top 3 step is **pre-filled** with the first three queens of their saved ranking (only queens with a look in the runway), unless they already saved a Top 3 or changed the proposal; they can edit it, and "Usar mi orden otra vez" re-applies it. The Top 3 itself is the regular `votes` ballot, unchanged: it is the vote of the week across **all** the categories of the runway, which is why it stays even for the jury (a runway can mix a group category with individual ones, and a judge may want to differ from their band ranking). Only **one group category per runway** is supported by the stepper.

### Help page

`/votacion-bandas` (`app/pages/votacion-bandas.vue`) explains the system in plain language, with a worked example (bands HOT and COLD) recomputed from `GROUP_RANKING`. Its copy lives in `app/utils/groupRankingContent.ts`. It is linked from the voting and results screens of group categories and from the group section of `/help`. It uses the theme tokens and shared classes only, and its table scrolls in its own container.

## Group photos

Each group has up to 4 landscape photos (**16:9 or 5:3**, with a 3% tolerance) shown together as one picture.

- Stored in the `runway-looks` bucket at `{category_id}/{group_id}/{uuid}.webp`, row in `category_group_photos` (one row per group, four nullable URL columns).
- Members of the group upload and replace them while the runway is in `werk_room`; judges until voting opens (`draft`, `werk_room`, `runway`).
- On the runway and voting pages (`CategoryGroupPhotos.vue`) each group shows its first photo as a landscape card with a photo counter, like the looks; clicking it opens the look dialog (`LookGalleryDialog`) with all the photos. The winning band (both on a draw) gets the same crown badge as the winning look, from `reveal` (it reads `category_group_result`). The editors keep the collage preview.
- Visibility follows the looks: the group's members and judges see them while preparing, everyone else from `voting`.
- The ratio is checked in the browser (`assertGroupPhotoRatio` in `app/utils/groupPhotos.ts`) before compressing; the database does not enforce it.
- Deleting the groups or the category removes the files from Storage (`useParticipantFiles`).

## Schema

- `categories.kind` (`category_kind` enum).
- `category_groups`: `category_id`, `position` (1 or 2), `name`, `intro` (free text, up to 1000 characters). Only allowed on group categories (trigger `enforce_group_category`).
- `set_group_intro(group_id, intro)` (`SECURITY DEFINER`): the only way members write the group `intro`, and only during `werk_room`. Members cannot update `category_groups` directly, so they cannot rename the group. The admin has no field for it.
- `category_group_members`: `category_id`, `group_id`, `participant_id`, unique per category and participant. Only `concursante`s.
- `category_group_votes` (jury, phase 1): one ballot per voter and category, editable while `voting`. `category_queen_votes` is legacy (see above).
- `category_group_photos`: see above.
- Helpers (`SECURITY DEFINER`): `participant_group_id`, `are_teammates`, `are_rivals`.
- Results: `category_group_result(category_id)` and `category_ranking_result(category_id)`, empty before `reveal`.
- `looks_select` also lets teammates read each other's looks during `werk_room`.

## Where it lives in the app

| Area | Files |
|---|---|
| Admin: type selector | `app/pages/admin/runways/[id]/categories.vue` |
| Admin: groups side panel | `app/components/AdminCategoryGroups.vue`, `app/components/AppDrawer.vue` |
| Admin: "Grupos" tab (photos) | `app/pages/admin/runways/[id]/looks.vue`, `app/components/GroupPhotosEditor.vue` |
| Werk Room: badge, "Ver grupo", teammates' looks | `app/pages/semana/[week]/werk-room.vue` |
| Group intro (inside the "Ver grupo" modal) | `app/components/GroupIntroEditor.vue` |
| Voting (stepper, band vote and ranking ballots) | `app/pages/runways/[id]/vote.vue` (stepper, Top 3) and `app/components/GroupCategoryVote.vue` (band and ranking steps) |
| Results ("Ver resultados" button and modal with the final ranking table) | `app/components/GroupCategoryResult.vue`, used by `app/pages/runways/[id]/index.vue`, which also adds the "Los grupos" heading above the group photos (`CategoryGroupPhotos.vue` `heading` prop) |
| Staged reveal (homepage) | `app/pages/index.vue`, `app/components/BandReveal.vue`, `app/components/TopThreeReveal.vue`, `app/composables/useConfetti.ts`, `loadBandResult` in `app/composables/useRunwayResults.ts` |
| Scoring constants and help page | `app/utils/groupRanking.ts`, `app/utils/groupRankingContent.ts`, `app/pages/votacion-bandas.vue` |
| Photos on runway and voting pages | `app/components/CategoryGroupPhotos.vue`, `app/components/GroupPhotosCollage.vue` |
| Upload logic | `app/composables/useGroupPhotos.ts`, `app/utils/groupPhotos.ts` |
| Look viewer (shared with the look dialog) | `app/components/LookGallery.vue` |

## Known limitations

- Saving the groups side panel runs several calls in a row, not one transaction; if it fails halfway, the panel reloads what was stored and shows the error.
- Database errors raised by the triggers (e.g. making a category individual while it has groups) are shown in English.
