# Copilot Instructions For This Repo

Always apply the architecture rules in docs/architecture-generation-skill.md before generating or editing code.

## Required behavior
- Prefer domain-first placement over temporary placement.
- Do not split files only for size reduction.
- Keep page-local code in its page folder (for example analyzerPage, reviewPage).
- Keep orchestration files thin and move domain rules to clear modules when justified.
- Remove dead and duplicate logic as part of the same change.

## Quality gate
Before considering work complete, run:
- npm run test
- npm run lint
- npm run build

If a requested change conflicts with these rules, explain the conflict and propose the smallest architecture-safe alternative.
