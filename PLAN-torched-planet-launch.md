# Plan — Torched Planet Launch

Written before execution per the Secret Lab Protocol (rule 2), so this sequence
survives an interrupted session.

## Context

The game was built as **Blastline**. It is being renamed to **Torched Planet** — an
homage to *Scorched Earth*. The local project folder has already been renamed from
`torched-earth` to `torched-planet` by the project lead.

The GitHub repository `DevCabin/torched-planet` already exists: public, described as
"homage to Scorched Earth", with **zero commits** (completely empty). No new repo needs
to be created and no existing repo needs to be renamed.

## Steps

- [ ] 1. Rename corrections — `index.html` `<title>` and `<h1>`, `README.md` heading,
      `CHANGELOG.md` entry, all from the interim "Torched Earth" to "Torched Planet".
- [ ] 2. Delete the 0-byte `torched-planet` artifact left over from the repo-creation step.
- [ ] 3. `git init -b main`, plus `.gitignore` covering `.DS_Store` and `.vercel/`.
- [ ] 4. Initial commit: `Import Torched Planet artillery duel`.
- [ ] 5. Add remote `https://github.com/DevCabin/torched-planet.git` and push `main`.
- [ ] 6. Verify the pushed tree and that raw `index.html` serves "Torched Planet".
- [ ] 7. Deploy on Vercel as project `torched-planet` (dashboard import of the repo, or
      `vercel link --yes --project torched-planet && vercel --prod`).
- [ ] 8. Record the live URL in `README.md`, the repo description/homepage, and
      `CHANGELOG.md`.

## Verification

- `grep -ri "torched earth" .` returns nothing outside this plan file's history notes.
- `grep -ri blastline .` returns only the intentional CHANGELOG history entry.
- `node --check game.js` passes (no JS is modified by the rename).
- Serving the directory locally returns HTTP 200 for `index.html`, `game.js`, `style.css`.
- The GitHub raw URL for `index.html` contains `Torched Planet`.

## Rollback

Nothing here is destructive except step 2, which removes a 0-byte unreferenced file.
The remote repo is empty, so a failed push leaves no partial state. Vercel projects can
be deleted from the dashboard if step 7 needs repeating.
