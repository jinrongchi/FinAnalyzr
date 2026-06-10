# Skill Conformance Matrix (2026-06-10)

This matrix maps key spec requirements to implementation and test evidence.

| Spec Area | Requirement | Implementation | Test Coverage |
|---|---|---|---|
| Hard gate | ST/*ST hard limit | src/lib/valuation/index.ts, src/lib/tushare/loader.ts | src/lib/valuation.test.ts |
| IPO filter | <5y confidence penalty; <1y stronger warning | src/lib/valuation/index.ts, src/lib/tushare/loader.ts | src/lib/valuation.test.ts |
| Industry adaptation | Shenwan-like mapping to model template | src/lib/tushare/loader.ts, src/lib/valuation/config.ts | src/lib/tushare.test.ts |
| Growth board | ChiNext/STAR risk controls | src/lib/tushare/loader.ts, src/lib/valuation/index.ts | src/lib/valuation.test.ts, src/lib/tushare.test.ts |
| Policy sensitivity | industry-based warning tags | src/lib/tushare/loader.ts, src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Financial exception | OCF/NI hard gate excluded for finance | src/lib/valuation/index.ts, src/lib/tushare/loader.ts | src/lib/valuation.test.ts, src/lib/tushare.test.ts |
| Profit quality | OCF/NI threshold ladder | src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Asset quality | goodwill and other receivables thresholds | src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Optional risk extension | related-party sales and external guarantee thresholds | src/lib/valuation/index.ts, src/components/views/AnalyzerView.tsx | src/lib/valuation.test.ts |
| Operations risk | AR/inventory turnover-days deterioration | src/lib/tushare/loader.ts, src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Dividend sustainability | high payout and weak cash support warnings | src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| DCF robustness | TV share guardrail + scenarios | src/lib/valuation/models.ts | src/lib/valuation.test.ts |
| ROE-PB robustness | sustainable ROE proxy | src/lib/valuation/models.ts | src/lib/valuation.test.ts |
| Financial nuance | PB<0.7 for financials still requires asset-quality caution | src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Composite scoring | explicit normalization + weighted output | src/lib/valuation/index.ts | src/lib/valuation.test.ts |
| Market context | ERP thermometer and +/- score override | src/lib/valuation/index.ts, src/lib/tushare/loader.ts | src/lib/valuation.test.ts |
| Dashboard outputs | score, range, warnings, expected return, thermometer, conformance checks | src/components/views/AnalyzerView.tsx | tests/integration/app.integration.test.tsx |
| Data provenance | field source and field notes | src/lib/tushare/loader.ts, src/types.ts | src/lib/tushare.test.ts |

## Remaining Gaps

1. No functional gaps remain against docs/skill.md requirements and optional enhancements currently in scope.
2. Runtime caveat: optional TuShare endpoints may be unavailable in some environments; when that occurs, the app safely falls back to existing values/manual input with source labeling.
