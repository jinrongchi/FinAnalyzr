# Architecture-First Generation Skill

## Purpose
Use this skill whenever adding or changing features so new code lands in the right module boundaries and does not require repeated refactors.

## Core Principle
Do not move code just to make one file smaller. Split or move only when the boundary is domain-valid and improves long-term maintenance.

## When To Apply
- Any new feature touching UI, valuation logic, data loading, or storage.
- Any file edit expected to add more than about 80 lines.
- Any change that introduces a second responsibility into one file.

## Project Architecture Rules

### UI Layer
- Page-level files live in a page folder under src/components/views.
- Keep page-specific helpers in the same page folder.
- Current pattern:
  - src/components/views/analyzerPage
  - src/components/views/reviewPage
- Shared UI primitives stay outside page folders (example: src/components/NumberField.tsx).

### Business Logic Layer
- Domain logic lives in src/lib by domain, not by generic names.
- Keep orchestration thin and place rule engines/calculators in dedicated modules.
- Prefer names that expose purpose, such as riskSignals, dataCoverage, scoring, marketData.

### Data Contracts
- Shared types live in src/types.ts.
- If introducing many domain-specific types, create a domain type module near that domain and re-export from a clear entry only when needed.

## Naming Rules
- Prefer function-first, domain-specific names.
- Avoid generic files like helpers.ts, utils2.ts, newLogic.ts unless truly shared and stable.
- File names should reveal business intent, not implementation trivia.

## Change Workflow (Mandatory)
1. Decide boundary first:
   - Is this page-local, domain-local, or shared?
2. Place code directly in final target location (avoid temporary dumping).
3. Keep orchestration entry files readable and short.
4. Remove dead code immediately after extraction.
5. Run quality gates:
   - npm run test
   - npm run lint
   - npm run build

## Extraction Decision Checklist
Extract only if at least 2 are true:
- The block has a clear domain concept (not random lines).
- The block can be named clearly as a reusable unit.
- The same concept appears or will appear in another place.
- The source file is mixing unrelated responsibilities.

If fewer than 2 are true, keep code local and readable.

## UI-Specific Guardrails
- Do not split every JSX fragment into components.
- Split when state ownership or business meaning becomes clearer.
- Keep state near the feature that owns it.
- Page component should mostly orchestrate panels/sections, not hold all rendering details.

## Definition of Done
A change is done only when:
- New/changed code follows folder boundaries above.
- No duplicate logic remains after extraction.
- Imports are stable and casing-consistent.
- Tests, lint, and build all pass.
- No speculative restructuring outside the scoped feature.

## Prompt Snippet For Future Tasks
Use this at the start of implementation requests:

"Apply Architecture-First Generation Skill from docs/architecture-generation-skill.md. Keep domain boundaries clear, avoid cosmetic file-splitting, and pass test/lint/build before finishing."

