# Changelog

All notable changes to this project are documented here.

## 2026-06-10

### Added

- China A-share risk controls and conformance instrumentation:
  - Added ST、上市年限、成长板、政策敏感、金融行业等风险标签联动。
  - Added growth-board discount-rate uplift on CAPM-derived discount rates.
  - Added conformance check panel in analyzer output for auditability.
- Valuation hardening:
  - Added DCF terminal-value share guardrail and explicit assumption output.
  - Added explicit normalized composite safety score mapping across model outputs.
  - Added dividend sustainability checks (high payout and weak cash support warnings).
  - Added day-based operations deterioration check using AR/Inventory turnover-day trend.
  - Added optional related-party sales ratio and external guarantee ratio red-flag thresholds.

### Changed

- Data ingestion and derivation:
  - `stock_basic` ingestion extended and now drives automatic industry template mapping.
  - `balancesheet` ingestion now includes `notes_receiv` for richer receivable context.
  - Turnover metrics now derive turnover-days and 3-year day-trend percentages.
- Dashboard UX:
  - Added expected return decomposition and thermometer context explanation.
  - Warning cards now use severity badges and include missing-field detail blocks.

### Fixed

- Fixed warning pipeline regression (`collectWarnings` input wiring) and hardened tests.
- Fixed strict null-safety edge in CPI fallback parsing.

### Tests

- Expanded valuation and TuShare unit tests to cover:
  - ST/IPO/board/policy/financial exceptions
  - market-cycle adjustment
  - DCF guardrail behavior
  - dividend sustainability flags
  - turnover-day deterioration thresholds

## 2026-06-09

### Added

- Valuation model set expanded and aligned for A-share long-term workflow:
  - Added ROE-PB model output.
  - Added CAPE model output (with method notes from data pipeline).
  - Added FCF/EV return model output.
  - Added SOTP model output with optional segment-based per-share inputs.
  - Added Graham formula model output as a cross-check anchor.
- Data enrichment and provenance enhancements:
  - Added 5Y percentile cloud inputs (PE/PB/PCF) alongside existing 10Y metrics.
  - Added field-level source/note metadata propagation into snapshots for review traceability.

### Changed

- Analyzer information architecture redesigned:
  - Home area now focuses on stock input + overall valuation report first.
  - Detailed assumptions moved into tabbed valuation systems: DCF, ROE-PB, Relative, CAPE/现金回报, SOTP, 风险与验证.
- Relative valuation composition updated to use PE/PB/PCF/PEG (replacing legacy EV-EBITDA-centered description in docs).
- CAPE estimation pipeline upgraded to support CPI-adjusted 10Y earnings baseline with nominal fallback and explicit note.
- Input source badge behavior refined:
  - Source badges only render when a field has an effective value.
  - Empty numeric fields render as 待补充 to reduce false confidence.

### Fixed

- Fixed runtime instability on incomplete/legacy forms by strengthening analysis input normalization and finite checks.
- Fixed valuation list mismatch by removing legacy DDM usage from active model pipeline/UI.
- Fixed integration compatibility after analyzer layout refactor (legacy heading expectation preserved in tests).

### Docs

- Updated README feature summary to reflect current model scope and summary-first tabbed analyzer UX.

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
