---
name: astock-valuation-project
description: 'Implement or refactor features in this A-share valuation app with architecture-first boundaries, domain-first placement, and mandatory quality gates. Use when changing analyzer/review UI, valuation logic, tushare data loading, storage, tests, or project-wide behavior.'
argument-hint: 'Describe feature, affected domain, and constraints (for example: analyzer UI + valuation risk signals)'
user-invocable: true
---

# A-Share Valuation Project Workflow

## What This Skill Produces
- Architecture-safe code changes placed directly in final domain locations.
- Minimal, non-cosmetic refactors that remove dead or duplicate logic when touched.
- Correct data-contract evolution across form inputs, analysis outputs, and UI consumption.
- China market aware valuation changes that preserve risk, coverage, and scoring behavior.
- Verified changes that pass test, lint, and build gates.

## When To Use
- New feature or bug fix in analyzer, review, valuation, tushare, storage, or hooks.
- Any edit likely to add significant logic or mix responsibilities.
- Any request where folder placement and module boundaries are part of correctness.
- Any task that updates assumptions in valuation, data fetch mapping, or scoring outputs.

## Inputs To Collect First
1. Target outcome: what behavior must change.
2. Scope: page-local, domain-local, or shared.
3. Constraints: API compatibility, Chinese market assumptions, test expectations.
4. Verification level: full gate (default) or user-approved exception.
5. Contract direction: add field, rename field, deprecate field, or behavior-only change.

## Procedure
1. Read architecture, repo, and valuation context.
   - Use [Architecture Rules](../../../docs/architecture-generation-skill.md).
   - Use [Repo Instructions](../../copilot-instructions.md).
   - Use [Valuation Context](../../../docs/skill.md) for China-market assumptions.
2. Map the change to the right boundary before writing code.
   - Page-local UI belongs under src/components/views/analyzerPage or src/components/views/reviewPage.
   - Shared UI primitives stay under src/components.
   - Business logic belongs under src/lib by domain (valuation, tushare, storage, risk, scoring).
   - Shared contracts stay in src/types.ts unless a clear domain type module is justified.
3. Apply extraction decision checklist.
   - Extract only if at least two are true:
     - clear domain concept,
     - clear reusable name,
     - concept appears or will appear elsewhere,
     - source file currently mixes responsibilities.
   - If fewer than two are true, keep code local and readable.
4. Plan data flow impact before edits.
   - For analysis features: trace src/data/defaults.ts -> src/types.ts -> src/lib/valuation/* -> view/hook consumers.
   - For tushare features: trace src/lib/tushare/* loaders/mappers -> typed outputs -> analyzer/review usage.
   - List affected tests before coding.
5. Implement in final location directly.
   - Keep orchestration thin.
   - Move rules/calculations to domain modules when justified.
   - Remove dead and duplicate logic in the touched area.
6. Run domain validation checks.
   - Valuation logic changes: verify qualityScore, safetyScore, redFlags, intrinsicRange, and longTermReturn remain internally consistent.
   - Market context changes: verify thermometer inputs and interpretation still align with China market fields.
   - Data fetch mapping changes: prefer field-name mapping over fixed positional assumptions when upstream columns can drift.
7. Validate behavior and non-regression.
   - Update or add focused tests nearest to changed behavior.
   - Preserve required user-facing text where tests depend on literals.
8. Run quality gates in order.
   - npm run test
   - npm run lint
   - npm run build
9. Report completion with boundary rationale.
   - Summarize what changed and why placement is architecture-safe.
   - Summarize data contract changes and backward compatibility impact.
   - Note any unresolved risk or follow-up item.

## Branching Logic
- If request conflicts with architecture rules:
  - Explain conflict.
  - Propose smallest architecture-safe alternative.
- If request changes valuation assumptions but lacks clear market rationale:
  - Keep current baseline assumptions.
  - Add extension points and document what evidence is needed for a follow-up adjustment.
- If edit is purely cosmetic splitting:
  - Do not split.
  - Keep local unless checklist justifies extraction.
- If issue spans UI and valuation logic:
  - Separate orchestration updates (view/hooks) from rule engine updates (src/lib/valuation).
- If data contract changes are required:
  - Update src/types.ts first, then implementation modules, then view consumers.
- If tushare response fields are incomplete or reordered:
  - Map by field name keys.
  - Add fallback/default handling and a focused regression test.
- If tests fail outside touched scope:
  - Fix only if plausibly impacted by this change; otherwise report as pre-existing or unrelated.

## Completion Criteria
- Code follows project folder boundaries and naming intent.
- No duplicated or dead logic introduced by the change.
- Data flow remains coherent from defaults/types to valuation to UI rendering.
- Domain outputs stay explainable (scores, warnings, and ranges remain consistent).
- Imports are stable and casing-consistent.
- test, lint, and build succeed.
- No speculative restructuring beyond requested scope.

## Prompt Examples
- /astock-valuation-project Add a new risk warning in analyzer and place logic in the correct valuation module.
- /astock-valuation-project Refactor a mixed UI plus calculation change with minimal architecture-safe extraction.
- /astock-valuation-project Implement tushare field fallback logic and keep tests green.
- /astock-valuation-project Extend intrinsic range presentation and wire new outputs through types, valuation, and analyzer UI.
- /astock-valuation-project Add a China-market risk signal with regression tests and architecture-safe placement.
