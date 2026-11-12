# Debt Snowball

Debt repayment planner: snowball, avalanche or balanced order, 0% and store card deadlines, 0% switch savings.

| What | Where |
|------|-------|
| Master page (edit this) | `debt-snowball.html` |
| Dave's own copy | a claude.ai artifact published from the master (syncs across his devices) |
| Standalone app, for sharing | https://electricbuffaloapps.github.io/debt-snowball/ |
| Build script | `build_standalone.py` (master in, `docs/` out) |
| Built site (never edit by hand) | `docs/`, served by GitHub Pages from `main` `/docs` |
| Payment engine tests | `tests/` (`node --test tests/*.test.mjs`) |
| Release recipe | `dev/release.json` |
| Release records | `dev/release-<yyyy-mm-dd>.md` |

This folder is the git repo (GitHub `ElectricBuffaloApps/debt-snowball`, public). Tracked: the master, the build script, `tests/`, `docs/`, this README, `.gitignore`, `.nojekyll`, `dev/release.json` and the release records. Not tracked: `archive/` and the rest of `dev/` (build notes).

## Changing it

1. Edit `debt-snowball.html`. Bump the version shown in the top bar (`<span class="ver">`) and its date.
2. Run the tests: `node --test tests/*.test.mjs` from this folder (Node 24 from NVM, no packages; a bare folder argument fails on Node 24). They read `debt-snowball.html`, or the file named in the environment variable `DEBT_MASTER` if it is set, and write only a scratch file in the system temp folder, which they delete.
3. Build: `python3 build_standalone.py`. It reads `debt-snowball.html`, writes `docs/` (and removes anything in `docs/` it did not write), and `docs/version.json` carries the build id.
4. Republish Dave's claude.ai artifact from the same file (only when the master changed).
5. Release by the recipe in `dev/release.json`: preflight, commit the named paths, annotated tag `v<version>`, push, then poll the live `version.json` until it shows the new build id. Nothing is pushed until Dave says yes.

Never `git add -A`, never `commit -a`, never force push.

## Pushing as the right account

Pushes use the **ElectricBuffaloApps** account through this repo's own credential helper. The repo's local git config clears the inherited credential helper for `https://github.com` and sets one that asks `gh` for the ElectricBuffaloApps token on each push; no token is stored in a file. Check it is set:

```bash
git config --local --get-all credential.https://github.com.helper
GIT_TERMINAL_PROMPT=0 git push --dry-run origin main
```

A fresh clone does not have the helper. Set it again from the repo folder (the first line may report nothing to unset):

```bash
git config --local --unset-all credential.https://github.com.helper
git config --local --add credential.https://github.com.helper ''
git config --local --add credential.https://github.com.helper '!f() { test "$1" = get || exit 0; t=$(/opt/homebrew/bin/gh auth token --user ElectricBuffaloApps) || exit 0; echo username=ElectricBuffaloApps; echo "password=$t"; }; f'
```


## Rollback

Tags `v<version>` on `main` are the release history (`v4.4` and `v4.5` were added afterwards for history; they hold the site at the repo root, from before `docs/`). Rollback steps are in `dev/release.json`.

## Data

- Standalone app: everything stays in the person's own browser (localStorage). Nothing is sent anywhere. Backup is copy and paste.
- claude.ai copy: saved to the viewer's private `data/users/<id>/state` in the artifact's database, falling back to the browser.
- On iPhone: add it to the home screen before entering debts and always open it from the icon.

## Updates on phones

The build writes `version.json` and the page checks it whenever it is shown. An open or home-screen app then offers "New version ready. Tap to update". The service worker fetches with `no-store`, because GitHub Pages caches pages for ten minutes.
