# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.0] - 2026-11-14

### Added

- Group categories are decided by ranking votes: each queen ranks all the queens of the rival band and each judge ranks all the contestants, with complete ballots submitted through `submit_ranking_ballot`. The final ranking from `category_ranking_result` averages both votes (50/50, normalized so bands of different sizes are comparable) and adds a 0.2 bonus for the band that won the judges' band vote, shown with 3 decimals on the results screen. In the reveal, a runway with a group category first reveals the winning band (same roulette and confetti effect as the Top 3; a draw shows both) and a judge-only button then reveals the Top 3 of the week for everyone, while the winning band slides down below it and takes the full width. The Top 3 and the group ranking stay hidden in the database until then (new `runways.top_three_revealed`, `reveal_runway_top_three`, `runway_results_visible`; requires migration `20261114000100_runway_reveal_stage.sql`). The vote page guides voters through a stepper with free navigation (jury: best band, order of the queens, Top 3 pre-filled from that order; contestants: order of the rival band, Top 3). New help page `/votacion-bandas` explains it with a worked example, linked from the voting and results screens and from the help page. Requires migration `20261114000000_group_ranking_votes.sql` (DRG-8)
- Release notes page at `/novedades` (link "Novedades" in the user menu) with the date and the functional features of each release, from `app/utils/releaseNotes.ts`
- Groups have an intro text, edited by their members from the "Ver grupo" modal in the Werk Room. Requires migration `20261113000000_group_intro.sql`

### Changed

- Queens in a group category get a second button next to "A desfilar" on the homepage while the week is on the runway, "A desfilar con mi banda", which shares the band's name, intro and photos like the look; the jury does not see it (DRG-8)
- On the public runway page, the results of a group category open in a modal from a "Ver resultados" button at the top (instead of showing the table first), the group photos have a "Los grupos" heading, the winning band's photo gets the crown badge like the winning look, and the homepage offers "Ver la pasarela" once the reveal has finished (DRG-8)
- Group photos on the runway and voting pages show the first photo with a photo counter and open all of them in the look dialog when clicked, like the looks (DRG-8)
- Group category voting no longer uses the Top 1 queen vote (`category_queen_votes` and `category_queen_result` stay as legacy and are not migrated); the voting screen now asks for complete rankings (DRG-8)
- Release process: definition of done (docs and help in the same PR), a `release` skill, a pull request template, release notes for every version and the date of the planned merge for the release (CLAUDE.md, `.claude/skills`, `.github`)
- Help page, README and `docs/group-categories.md` describe group categories and group photos

## [0.2.0] - 2026-11-13

### Added

- Group categories: a category can be individual (default) or group, with two groups of queens assigned by the jury from an "Editar grupos" side panel in the admin. Queens see a "Categoría grupal" badge and their teammates' looks in the Werk Room. In voting, only the jury votes for the winning group (a draw makes both win), and each queen votes a Top 1 among the rival group's queens, giving a group winner plus a Top 1 queen. Results appear from the reveal. Each group also has up to 4 landscape photos (16:9 or 5:3) shown together as one picture: members upload them from "Ver grupo" in the Werk Room, judges manage them in a new "Grupos" tab of the admin looks, and they appear on the runway and voting pages. Requires migrations `20261111000000_group_categories.sql` and `20261111000100_group_photos.sql` (DRG-5)

## [0.1.2] - 2026-11-09

### Changed

- App name changed from "Drag Race Game" to "Shantay You Play" in titles, headings, meta tags, help copy and docs, through a single `APP_NAME` constant (`app/utils/brand.ts`). The logo image is unchanged for now

## [0.1.1] - 2026-11-09

### Added

- Themed error page (`app/error.vue`) in Spanish for 403, 404 and unexpected errors (DRG-1)

### Changed

- Project (package and repository) renamed to `shantay-you-play`

### Fixed

- The public runway page answers 403 with a drag-themed message until the runway reaches voting, reveal or closed, for everyone including the jury (DRG-1)
- Looks and jury looks are no longer readable through the API by other participants during the Pasarela stage (RLS migration `20261109000000_looks_hidden_until_voting`) (DRG-1)
