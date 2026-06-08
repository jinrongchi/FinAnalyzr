# Changelog

All notable changes to this project are documented here.

## 2026-06-08

### Added

- Review compare enhancement:
  - B dropdown defaults to snapshots with the same ticker as A.
  - Added checkbox to optionally show snapshots from other tickers.
- History page UX improvements:
  - Search input for stock name/ticker filtering.
  - Per-item freshness badge (latest/today/within 3 days/stale).
  - Inline per-item feedback for refresh/snapshot actions.

### Changed

- Review compare behavior:
  - Removed automatic A/B swapping by time to preserve explicit user selection.
  - Prevented B selection flicker when the same-ticker scope has no candidates.
- History page actions:
  - Clear action hierarchy for primary/secondary/danger actions.
  - Delete now uses explicit confirmation with stock name and ticker.
- Analyzer input row:
  - TuShare load button localized to Chinese text: 加载 TuShare.
  - Button size/alignment adjusted to align with first-row input fields.

### Fixed

- Stable compare selection handling when a stock has only one snapshot under same-ticker filtering.
- Correct width alignment of top philosophy/tool-boundary section with main content width.

### Docs

- Moved the long recent-update notes from README into this dated changelog.
- README now points to changelog for detailed release history.
