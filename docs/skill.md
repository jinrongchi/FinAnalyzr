# DeepValue – A-Share Long-Term Value Investment Tool (China Market Edition)

## 0. Why This Document Exists
Western AI models often assume US‑style financial reporting (GAAP/IFRS without Chinese specifics),  
mature market dynamics, and different industry structures.  
This spec explicitly maps **Chinese Accounting Standards (CAS)** to Tushare fields,  
explains **A‑share market idiosyncrasies** (policy effects, state‑owned enterprises, shell premiums),  
and provides defensive defaults proven in China’s market.

---

## 1. Goal
Build a robust long‑term value assessment tool for the **China A‑share market** (Shanghai/Shenzhen).  
It must combine absolute valuation, relative valuation, and financial quality screening,  
automatically adapt to **Shenwan (SW) industries**, and output a comprehensive risk‑aware score.

Data source: **Tushare Pro** (all data auto‑fetched).

---

## 2. Critical A‑Share Context (Read Before Coding)
- **Accounting Standards:** Chinese Accounting Standards (CAS) are similar to IFRS but differ in details (e.g., goodwill impairment only when signs exist, not annual). Tushare fields reflect CAS.
- **IPO & Shell Value:** Companies listed < 3 years (especially < 1 year) often have inflated profits pre‑IPO and inflated valuations. **Minimum 5 years listed** for core valuations, or flag heavily.
- **State‑owned Enterprises (SOEs):** Often have lower bankruptcy risk and more stable dividends but may have low capital efficiency (low ROE). Do not penalise them purely on low growth; adjust expectations.
- **Delisting Risk & ST Stocks:** The tool must detect `*ST` / `ST` status from `stock_basic.name` or `daily_basic`. These stocks are immediately flagged as speculative, and risk scores are capped.
- **Policy & Industry Distortions:** Sectors like real estate, education, healthcare sometimes face sudden regulatory crackdowns. The tool cannot predict policy, but must note “policy‑sensitive” tags.
- **Main Board vs ChiNext/STAR (科创/创业):** ChiNext (300xxx) and STAR (688xxx) have higher volatility, different listing rules, and often higher initial growth but lower profitability. Valuation parameters should reflect higher discount rates for small caps without profit.

---

## 3. Data Pipeline & Tushare Field Mapping

### 3.1 Required Tushare Tables & Exact Fields
(CAS names; use `ts_code` as stock identifier.)

**stock_basic**
- `ts_code`, `name`, `industry`, `list_date`, `market` (主板/创业板/科创板)

**income** (quarterly, `end_date` as ‘YYYYMMDD’ or ‘YYYYQ’)
- `revenue`, `total_cogs`
- `sell_exp`, `admin_exp`, `fin_exp`
- `n_income_attr_p` (归母净利润)
- `minority_int` (少数股东损益)
- `ebit` = `revenue - total_cogs - sell_exp - admin_exp + fin_exp` (optional, may need calculation)
- `dep_amor` – depreciation & amortisation included in expenses; Tushare provides it separately or within `cashflow` supplement.

**balancesheet** (quarterly)
- `goodwill`, `intan_assets` (无形资产)
- `other_receiv` (其他应收款) – critical for capital occupation risk
- `total_hldr_eqy_exc_min_int` (归母净资产)
- `total_liab`, `total_assets`
- `inventories`, `acct_receiv` (应收账款)
- `notes_receiv` (应收票据 – may be merged)
- `acct_payable` (应付账款)
- `money_cap` (货币资金)
- `st_borrow`, `lt_borrow` (短期借款, 长期借款)

**cashflow** (quarterly)
- `c_fr_oper` (经营活动现金流量净额)
- `c_paid_for_assets` (购建固定资产、无形资产和其他长期资产支付的现金) – used as CapEx
- `st_cash_out_other` (支付其他与投资活动有关的现金) – watch for hidden CapEx, but default to `c_paid_for_assets`.
- `c_fr_inv_total` (投资活动净额) – for cross‑check

**daily_basic**
- `pe`, `pe_ttm`, `pb`, `total_mv`, `circ_mv`
- `turnover_rate_f` – high turnover may indicate speculative fever, can be used as qualitative flag.

**daily**
- `close`, `adj_factor` – for total return calculations and historical market cap reconstruction.

**index_dailybasic** (for `000300.SH` CSI 300)
- `pe`, `pb`

**macro** or **yield_curve**:
- `yield_curve` – 10‑year China Government Bond yield. If not available, use `shibor` or `macro` table.
- `cpi` – monthly CPI for inflation adjustment.

### 3.2 Data Processing Rules Specific to A‑Shares
- **TTM (Trailing Twelve Months):** For quarterly data, aggregate last 4 quarters. For semi‑annual/ annual, adjust. Prefer using `end_date` to build correct TTM window.
- **Consolidated Statements:** Tushare gives consolidated statements by default. Use parent company figures only when specifically needed (e.g., `n_income_attr_p` already parent).
- **Adjust for Non‑recurring Items:** When computing sustainable earnings, deduct extraordinary gains/losses. Tushare has `extraordinary` table or calculate from `deducted_profit`. Always prefer **扣非净利润** for valuation if available. Use `n_income_attr_p` minus non‑recurring if no dedicated field.
- **Floating Shares vs Total Shares:** Use `total_mv` for valuation but note lock‑up periods for recent IPOs (shares not yet tradable). For intrinsic value per share, divide by total shares including non‑tradable (but most Chinese companies are fully tradable now, `circ_mv` ≈ `total_mv`).

---

## 4. Module 1: A‑Share Specific Financial Red Flags

### 4.1 Profit Quality – CFO / Net Profit (3‑Year Average)
**Formula:**  
`ratio = (c_fr_oper TTM) / (n_income_attr_p TTM)`  
Calculate for each fiscal year (or TTM) and average over last 3 years.

**Why this is crucial in A‑shares:** Many firms manipulate revenue/ profit by creating fictitious sales that generate accounting profit but no cash. The “Kangde Xin” (康得新) and “Kangmei Pharmaceutical” (康美药业) cases are infamous examples where CFO/Net Profit < 0.5 for years before implosion.

**Thresholds (3‑year average):**
- `< 0.5` → 🔴 **Immediate Reject** – “Severe cash flow deficiency, possible fabrication”.
- `0.5 – 0.7` → 🟡 **Strong Warning** – “Weak cash conversion, investigate receivables and inventory”.
- `0.7 – 1.0` → 🔵 **Caution** – “Below healthy level”.
- `≥ 1.0` → 🟢 Normal.

**Implementation Note:** For financial institutions (banks, insurers, brokerages), this ratio is meaningless. Exclude them. For real estate developers, use a modified version due to large prepayments; but still flag if negative consistently.

### 4.2 Other Receivables / Equity – “Big Other Receivables” (大额其他应收款)
**Why:** “Other receivables” is a notorious channel for major shareholders to siphon funds out of listed companies (e.g., Huayi Brothers, Baoshang Bank cases). A‑share regulators treat high other receivables as a red flag.

**Formula:** `other_receiv / total_hldr_eqy_exc_min_int`  
- If > 20% → 🟡 **Significant capital occupation suspicion**.  
- If > 50% → 🔴 Hard reject, likely hollowed out.

### 4.3 Goodwill / Equity – “Goodwill Thunder” (商誉减值风险)
**Why:** After the 2014‑2015 M&A boom, many A‑share companies accumulated huge goodwill from overpriced acquisitions. Sudden goodwill impairments can wipe out years of profit. Massive impairments often happen around Chinese New Year as “financial thunder”.  

**Formula:** `goodwill / total_hldr_eqy_exc_min_int`  
- > 30% → 🟡 “High goodwill risk – monitor target company performance”.  
- > 50% → 🔴 “Very high risk; potential major impairment”.  

**Sector Exception:** Light‑asset tech companies with real strong acquired assets may have higher goodwill. Use caution, but still flag.

### 4.4 Accounts Receivable + Inventory Quality
**Why:** A‑share companies in manufacturing/construction often have “profit on paper” via revenue recognition while payment never arrives or inventory builds up unsold.

**Metrics:**
- **Receivable Turnover Days** = `(acct_receiv + notes_receiv) / (revenue TTM) * 365`
- **Inventory Turnover Days** = `inventories / (total_cogs TTM) * 365`
- Compute trend over 3 years (annual). If both metrics increase > 30% cumulatively over 3 years → 🟡 “Operating efficiency declining, possible channel stuffing or obsolescence”.

### 4.5 Related‑Party Transaction & Guarantee Risk (Optional Enhancement)
If data available (Tushare `related_party` table), flag if:
- Total related‑party sales > 30% of revenue.
- External guarantees > 50% of net equity.

---

## 5. Module 2: A‑Share Industry Classification & Valuation Weight Matrix

### 5.1 Industry Standard: Shenwan (申万) 2021 Classification
Tushare `stock_basic.industry` often uses Shenwan level‑1 names. Map to the following sectors. If mapping uncertain, ask user to verify.

**Shenwan Level‑1 → Tool Sector Mapping:**

| Shenwan SW Name (CN) | Tool Sector | Characteristics |
|-----------------------|-------------|-----------------|
| 食品饮料, 医药生物, 家用电器 | **Consumer & Pharma** | Stable cash flow, brand moat |
| 银行, 非银金融, 房地产 | **Financial & Real Estate** | Asset‑heavy, leverage sensitive |
| 钢铁, 化工, 有色金属, 采掘, 建筑材料 | **Cyclical Materials** | Commodity price dependent, cyclical |
| 公用事业, 交通运输 (公路/铁路/港口) | **Utilities & Infrastructure** | Stable cash flow, high dividend |
| 电子, 计算机, 通信, 传媒 | **Technology (TMT)** | Growth but R&D intensive, intangible assets |
| 汽车, 机械设备, 电气设备, 国防军工 | **Industrial & Manufacturing** | Cyclical but with tech elements; hybrid |
| 农林牧渔, 商业贸易, 休闲服务, 轻工制造 | **Other Cyclical/Consumer** | Mixed; use balanced model |

### 5.2 Valuation Model Weights (Default)
Each sector’s final score is a weighted sum. All weights must sum to 1.

**Consumer & Pharma**
- Modified DCF: 40%
- ROE‑PB: 30%
- PE (TTM) 10‑yr percentile: 30%

**Financial & Real Estate**
- ROE‑PB: 60%
- PB 10‑yr percentile: 20%
- Dividend Yield: 20%
(PE not used for banks; ROE‑PB is standard)

**Cyclical Materials**
- Shiller PE (CAPE): 40%
- PB 10‑yr percentile: 30%
- Price/Cash Flow (PCF) percentile: 30%
(PCF = Total Market Cap / Operating Cash Flow TTM)

**Utilities & Infrastructure**
- Dividend Yield: 40%
- Modified DCF: 30%
- PB percentile: 30%
(PE and PCF also acceptable, but dividend focus)

**Technology (TMT)**
- PEG (using 3‑5yr growth estimate): 40%
- ROE‑PB: 30%
- Modified DCF: 30%
(Many TMT have no earnings, fallback to P/S or adjusted DCF)

**Industrial & Others**
- DCF: 30%
- ROE‑PB: 30%
- PE percentile: 40%

### 5.3 IPO Age Filter
Stocks listed less than 5 years: Reduce final confidence score by 20% and display “Limited history – high uncertainty”. Do not exclude them but penalise.

---

## 6. Module 3: Valuation Engine – China‑Appropriate Calculation Details

### 6.1 Modified DCF
**6.1.1 Free Cash Flow Calculation (TTM)**
- `FCF = NOPAT + Depreciation – Capex – ΔWorking Capital`
- **NOPAT**: Use `ebit * (1 - tax_rate)`. Tax rate can be assumed 25% for most, or obtain effective rate from income statement.
- **Depreciation**: `dep_amor` from cash flow supplement (Tushare sometimes has it in `cashflow` table or supplemental). If not available, approximate as 5% of fixed assets.
- **Capex**: `c_paid_for_assets` from cash flow. If company is in heavy expansion, consider normalising to maintenance capex (e.g., average of last 3 years). For conservatism, use reported Capex.
- **ΔWorking Capital**: Simplify as `(Acct_Receiv_TTM - Acct_Receiv_PrevYear) + (Invent_TTM - Invent_PrevYear) - (Acct_Payable_TTM - Acct_Payable_PrevYear)`. All balances from BS. Avoid using cash flow working capital line due to many adjustments.

**6.1.2 Growth Rate Projection**
- Phase 1 (years 1‑5): `g = min( past 3‑year revenue CAGR * 0.7, 15% )`. For utilities: cap at 10%. User adjustable.
- Phase 2 (years 6‑10): linearly decline to `g_term = 3%`.

**6.1.3 Terminal Value**
- `TV = FCF_10 * (1+3%) / (WACC – 3%)`.
- As a safety check, terminal value should not exceed 70% of total enterprise value. If it does, raise WACC or lower g_term.

**6.1.4 Discount Rate – WACC (China Version)**
- **Risk‑free rate:** Latest 10‑year CGB yield (e.g., currently ~2.5-3%). Use Tushare macro.
- **Equity Risk Premium (ERP) for A‑shares:** Historically 5%-8%. Default **6.5%**.
- **Beta:** Estimate from daily returns vs CSI 300 over 2 years. If not computable, use industry average.
- **Cost of Equity = Rf + Beta * ERP**.
- **Cost of Debt:** Assume 4% for most, 3% for SOEs.
- **Capital Structure:** Use target D/E ratio (book value, or assume 30% debt for most non‑financial).
- **WACC = Equity% * Cost_Equity + Debt% * Cost_Debt * (1 - tax).**
- **Default WACC if unable to compute:** 9% for stable companies, 10% for cyclical/TMT, 11% for high risk. This is reasonable for China.

**6.1.5 Sensitivity**
Generate bear/base/bull:
- Bear: WACC +1%, g -1%.
- Base: as estimated.
- Bull: WACC -1%, g +1%.
Output intrinsic value per share range.

### 6.2 ROE‑PB Framework (Crucial for Financials)
- **ROE_sustainable:** `min( last 5‑year median ROE_deducted, current ROE TTM )`. ROE_deducted is 扣非ROE (net income excluding extraordinary items / equity).
- **g:** 3% (terminal nominal growth)
- **r:** Cost of equity (from WACC module).
- **Fair PB = (ROE - g) / (r - g)**.
  Example: ROE=12%, r=9% → Fair PB = (0.12-0.03)/(0.09-0.03)=1.5.
- **Valuation gap = (Current PB / Fair PB - 1) * 100** (negative = undervalued).

**China‑Specific Adjustment:** For banks, many trade below fair PB due to NPL fears. The tool should highlight “Bank stocks often trade at discount due to asset quality concerns; PB under 0.7 may still not be safe.” Optional: incorporate provision coverage ratio if data available.

### 6.3 Shiller PE (CAPE) for Cyclicals
**Process:**
1. Fetch last 10 fiscal years’ `n_income_attr_p` (annual).
2. Adjust each year’s profit by CPI (divide by CPI_factor relative to latest year). If CPI unavailable, use nominal — it’s still better than single‑year PE.
3. Compute 10‑year average real profit.
4. `CAPE = Total Market Cap / 10‑year avg real profit`.
5. **Score:** Compute current CAPE’s percentile within its own 10‑year history. A lower percentile means cheaper. (Note: many cyclicals have short history, require at least 7 years.)

**China Note:** Cyclicals like steel and chemical have extreme profit swings; CAPE is far superior to standard PE. Display “CAPE Percentile” prominently.

### 6.4 Market Thermometer: ERP & Flow Indicators
- **ERP = E/P of CSI 300 - 10Y CGB yield.** E/P = 1 / PE_ttm of CSI 300.
- **History:** At least 5 years of daily ERP values. Compute current percentile.
- **Thresholds for overall market:**
  - ERP > 3% (or > historical 90th percentile) → extremely undervalued, “Buy signal”.
  - ERP < 1.5% (or < historical 10th percentile) → overvalued, “Caution”.
- **Retail Sentiment Proxy (optional):** When average turnover rate of all stocks spikes to extreme (e.g., top 10% of history), market may be euphoric. Add caution flag.

### 6.5 PEG for Growth (Tech, Healthcare)
- `PEG = PE_TTM / (Future Net Profit CAGR * 100)`.
- **Growth Rate Estimation:** Use consensus forecast if integrated; otherwise, use a conservative proxy: `min( past 3‑year revenue CAGR * 0.5, 25% )`. This 0.5 haircut accounts for mean reversion.
- **Interpretation:** PEG < 0.8 undervalued, > 1.5 overvalued. For TMT, acceptable range is higher, but still flag > 2.

### 6.6 Dividend Yield & Stability Check
- **Yield:** Average dividend per share (last 3 years) / current price. Use `dv_ratio` from Tushare if available.
- **Red Flags for Dividends:**
  - Dividend payout ratio > 70% and CFO < dividend payments.
  - Sudden large dividend increase without profit growth (potential one‑off).
  - SOEs often have policy‑driven dividends, still treat as positive but check sustainability.

### 6.7 FCF/EV Yield
- `EV = market cap + (st_borrow + lt_borrow) - money_cap`.
- `FCF = FCF_TTM` as in DCF.
- `FCF/EV > 5%` attractive; `> 8%` very attractive. Display as yield equivalent.

---

## 7. Module 4: Composite Score & A‑Share‑Specific Adjustments

### 7.1 Score Normalization (0‑100)
Each model outputs a raw number (e.g., DCF margin, PB discount, percentile). Map to 0‑100:
- **DCF Safety Margin:** margin -10% → 20, margin 0% → 50, margin 30% → 80, margin 50% → 100.
- **PB Discount (ROE‑PB):** discount -20% → 20, 0% → 50, 20% → 80.
- **PE/CAPE Percentile:** score = 100 - percentile*100. (20th percentile => 80 score).
- **PEG:** PEG=2 → 20, PEG=1 → 60, PEG=0.5 → 90.
- **Dividend Yield:** yield 1% → 20, 3% → 50, 5% → 80, 7% → 100. (For utilities, shift thresholds up).
- **FCF/EV:** 0% → 0, 5% → 70, 8% → 100.

### 7.2 Market Context Override
If ERP thermometer shows “extreme undervaluation” (ERP > 90th percentile), apply a **+10% bonus** to all final scores (capped at 100). If “extreme overvaluation”, deduct 10%. This aligns with A‑share cyclicality.

### 7.3 Confidence & Flag System
- **Special Treatment (ST):** If stock is ST or *ST (check name), final score capped at 30, and display “Speculative – ST stock”.
- **ChiNext/STAR Board:** Small cap (< 10bn RMB) with no profit: cap DCF and PEG contribution, rely more on P/B or revenue multiples (if implemented).
- **Red‑Flag Box:** List all triggered Module‑1 warnings. If any 🔴 hard reject, overall score set to 0 and “Do Not Invest” label.

---

## 8. Final Dashboard Per Stock
The output must include:
1. **Composite Score (0‑100)** with color gauge.
2. **Intrinsic Value Range** (from DCF) and current price, “Margin of Safety %”.
3. **Historical Valuation Thermometer** (current PE/PB/CAPE percentile in 10‑year context).
4. **Long‑Term Expected Annual Return** (dividend + growth + reversion).
5. **Red‑Flag Warnings** (if any).
6. **Market Context** – small ERP gauge on the side.

---

## 9. Implementation Sequence
- **Phase 1:** Data ingestion & pre‑filtering (financial red flags, ST detection).
- **Phase 2:** Simple relative valuations (PE, PB, CAPE percentiles, ERP).
- **Phase 3:** Core DCF and ROE‑PB engines.
- **Phase 4:** Composite scoring and web dashboard.

Adhere to this spec rigorously, using the exact Tushare fields and Chinese market thresholds described. Any modifications must be justified and documented.