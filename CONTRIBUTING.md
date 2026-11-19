# Contributing

Three or more people work on this repository. These rules keep `main` working and keep the event's data safe.

## Branches and pull requests

- `main` is always deployable. Nobody pushes to it directly: every change goes through a pull request with at least one approval and a passing CI.
- Work on a short branch from an up-to-date `main`, one task per branch: `feat/<what>`, `fix/<what>`, `chore/<what>`, `docs/<what>`.
- Keep pull requests small and about one thing. Squash-merge them; the PR title becomes the commit message, in the style of the existing history (`feat(missions): …`, `fix(checkpoints): …`).
- Rebase or merge `main` into your branch before asking for review, and delete the branch after merging.
- Ask for review from someone who did not write the change. Security-sensitive paths (see `.github/CODEOWNERS`) need the maintainer.

## Avoiding clashes

- Agree on who takes which module (`src/features/<name>`) before starting. Features are independent, so this rarely collides.
- These files are touched by almost everyone: `src/shared/copy/es.ts`, `docs/progress.md`, `docs/architecture.md`, `CLAUDE.md`. Keep edits there small, add your lines next to related ones, and update your branch often so conflicts stay tiny.
- Do not reformat files you are not changing.

## Code rules

- UI text is in Spanish and lives in `src/shared/copy/es.ts`. Code, identifiers, comments and tests are in English.
- Follow the layers in `docs/architecture.md`: `src/features/<name>/{domain,data,ui}` with a public `index.ts` / `server.ts`; anything that joins several features goes in `src/app-shell`.
- XP, credits and QR validation are decided on the server, never trusted from the client.
- Write tests with the change. Before opening a PR run `npm run typecheck`, `npm run lint` and `npm test`.
- Update `docs/progress.md` when you finish something, and add a line to the decisions log in `docs/architecture.md` when you change a rule.

## Data and secrets

- Develop against the Firebase emulators or a development project, never the event's real project (see the README).
- Never commit `.env*` files, service account keys or API keys. Server secrets are never prefixed with `NEXT_PUBLIC_`.
- Changes to `firestore.rules` and permissions need a test and the maintainer's review.
- Scripts in `scripts/` that write data must stay safe to repeat and should show what they would do before applying it.

## Setting up the repository on GitHub (maintainer)

The files in `.github/` do nothing for protection until the repository is configured:

1. **Settings › Rules › Rulesets**: protect `main`: require a pull request with 1 approval, dismiss stale approvals, require the `Typecheck, lint and tests` check and an up-to-date branch, block force pushes and deletion.
2. **Settings › General › Pull Requests**: allow only squash merging and automatically delete head branches.
3. **Collaborators and teams**: give the others the Write role, not Admin, preferably through an organization team.
4. **Organization › Authentication security**: require two-factor authentication.
5. Replace `@OWNER-USERNAME` in `.github/CODEOWNERS` and turn on "Require review from Code Owners" in the ruleset.
