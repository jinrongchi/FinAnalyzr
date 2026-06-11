<template>
  <div class="dashboard">
    <!-- Header row -->
    <div class="dash-header card">
      <div class="dash-title">
        <span class="stock-name">{{ r.stock_name }}</span>
        <span class="stock-code mono muted">{{ r.ts_code }}</span>
        <span class="industry-tag">{{ INDUSTRY_LABELS[r.industry_group] || r.industry_group }}</span>
        <span v-if="isST" class="flag-warning" style="font-size:12px; margin-left:4px">ST</span>
      </div>
      <div class="dash-rec" :class="recClass">{{ REC_LABELS[r.recommendation] }}</div>
    </div>

    <!-- Hard reject overlay -->
    <div v-if="r.hard_reject" class="reject-banner flag-reject" style="padding:16px; font-size:15px; font-weight:600">
      🔴 硬性拒绝 — 存在严重财务红旗，不建议投资
    </div>

    <!-- KPI row 1: Price / Score / DCF / MoS -->
    <KpiGrid>
      <KpiCard label="当前价格" :value="r.current_price" format="cny" source="auto" />
      <div class="card score-card">
        <div class="kpi-label muted" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px">综合评分</div>
        <ScoreRing :score="r.composite_score" :size="100" />
      </div>
      <KpiCard label="DCF基准价" :value="r.dcf?.base" format="cny" :source="dcfSource" />
      <KpiCard
        label="安全边际"
        :value="r.dcf?.margin_of_safety"
        format="pct"
        :colorize="true"
        :source="dcfSource"
      />
      <KpiCard label="预期年化回报" :value="r.expected_return?.total" format="pct" source="calc" :colorize="true" />
    </KpiGrid>

    <!-- DCF range bar -->
    <div v-if="r.dcf?.base" class="card dcf-range">
      <div class="section-title">DCF 内在价值区间</div>
      <div class="range-labels">
        <span class="text-red">熊市 ¥{{ fmt2(r.dcf.bear) }}</span>
        <span class="text-accent">基准 ¥{{ fmt2(r.dcf.base) }}</span>
        <span class="text-green">牛市 ¥{{ fmt2(r.dcf.bull) }}</span>
      </div>
      <div class="range-bar">
        <div class="range-track">
          <div class="range-fill" :style="rangeStyle" />
          <div class="price-marker" :style="priceMarkerStyle" title="当前价格">▼</div>
        </div>
      </div>
      <div class="range-note muted">WACC、增长率敏感性分析：熊 (WACC+1%, g-1%) / 牛 (WACC-1%, g+1%)</div>
    </div>

    <!-- Two-column: Model scores + Red flags -->
    <div class="two-col">
      <div class="card">
        <div class="section-title">各模型估值贡献</div>
        <ModelScores :scores="r.model_scores" />
      </div>
      <div class="card">
        <div class="section-title">红旗警告</div>
        <RedFlagPanel :flags="r.red_flags" />
      </div>
    </div>

    <!-- Expected return breakdown -->
    <div v-if="r.expected_return" class="card">
      <div class="section-title">长期预期年化收益拆解</div>
      <div class="return-row">
        <div class="ret-item">
          <span class="muted">股息收益</span>
          <span class="text-green mono">{{ pct(r.expected_return.dividend) }}</span>
        </div>
        <span class="ret-plus muted">+</span>
        <div class="ret-item">
          <span class="muted">业绩增长</span>
          <span class="text-accent mono">{{ pct(r.expected_return.growth) }}</span>
        </div>
        <span class="ret-plus muted">+</span>
        <div class="ret-item">
          <span class="muted">估值均值回归</span>
          <span :class="r.expected_return.reversion >= 0 ? 'text-green' : 'text-red'" class="mono">
            {{ pct(r.expected_return.reversion) }}
          </span>
        </div>
        <span class="ret-plus muted">=</span>
        <div class="ret-item ret-total">
          <span class="muted">合计</span>
          <span :class="r.expected_return.total >= 0 ? 'text-green' : 'text-red'" class="mono" style="font-size:20px; font-weight:700">
            {{ pct(r.expected_return.total) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Market context -->
    <div class="card">
      <div class="section-title">市场背景</div>
      <div style="display:flex; gap:24px; flex-wrap:wrap; align-items:center;">
        <div>
          <span class="muted" style="font-size:12px">ERP 当前</span>
          <span class="mono" style="margin-left:8px">{{ r.market_context?.erp != null ? pct(r.market_context.erp) : '--' }}</span>
        </div>
        <div>
          <span class="muted" style="font-size:12px">ERP 历史分位</span>
          <span class="mono" style="margin-left:8px">{{ r.market_context?.erp_percentile != null ? pct(r.market_context.erp_percentile) : '--' }}</span>
        </div>
        <div>
          <span class="muted" style="font-size:12px">市场调节</span>
          <span class="mono" :class="r.market_context?.market_bonus > 0 ? 'text-green' : r.market_context?.market_bonus < 0 ? 'text-red' : ''" style="margin-left:8px">
            {{ r.market_context?.market_bonus ? (r.market_context.market_bonus > 0 ? '+' : '') + pct(r.market_context.market_bonus) : '0%' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Data sources -->
    <div class="card sources-panel">
      <div class="section-title" style="cursor:pointer" @click="showSources = !showSources">
        数据来源追溯 {{ showSources ? '▲' : '▼' }}
      </div>
      <div v-if="showSources" class="sources-grid">
        <template v-for="(src, field) in r.sources" :key="field">
          <span class="muted" style="font-size:12px">{{ field }}</span>
          <SourceBadge :source="src" />
        </template>
      </div>
      <div v-if="r.warnings?.length && showSources" class="warn-list">
        <div v-for="w in r.warnings" :key="w" class="muted" style="font-size:12px">⚠️ {{ w }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import KpiGrid from '@/components/KpiGrid.vue'
import KpiCard from '@/components/KpiCard.vue'
import ScoreRing from '@/components/ScoreRing.vue'
import ModelScores from '@/components/ModelScores.vue'
import RedFlagPanel from '@/components/RedFlagPanel.vue'
import SourceBadge from '@/components/SourceBadge.vue'

const props = defineProps({ result: Object })
const r = computed(() => props.result)
const showSources = ref(false)

const INDUSTRY_LABELS = {
  consumer_pharma: '消费&医药', financial_re: '金融&地产',
  cyclical_materials: '周期材料', utilities_infra: '公用事业',
  technology: 'TMT科技', industrial: '工业制造', other: '其他',
}
const REC_LABELS = {
  do_not_invest: '拒绝投资', watch: '观察', fairly_valued: '合理估值',
  attractive: '有吸引力', very_attractive: '非常有吸引力',
}
const REC_CLASSES = {
  do_not_invest: 'text-red', watch: 'text-yellow',
  fairly_valued: '', attractive: 'text-green', very_attractive: 'text-green',
}

const isST = computed(() => r.value?.stock_name?.includes('ST'))
const recClass = computed(() => REC_CLASSES[r.value?.recommendation] || '')
const dcfSource = computed(() => r.value?.sources?.wacc || 'calc')

const fmt2 = (v) => v != null ? Number(v).toFixed(2) : '--'
const pct = (v) => v != null ? (v * 100).toFixed(1) + '%' : '--'

const rangeStyle = computed(() => {
  const d = r.value?.dcf
  if (!d?.bear || !d?.bull) return {}
  return { width: '100%' }
})

const priceMarkerStyle = computed(() => {
  const d = r.value?.dcf
  const p = r.value?.current_price
  if (!d?.bear || !d?.bull || !p) return { display: 'none' }
  const lo = d.bear, hi = d.bull
  const pos = Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100))
  return { left: pos + '%' }
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 14px; }
.section-title { font-weight: 600; font-size: 13px; margin-bottom: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }

.dash-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.dash-title  { display: flex; align-items: center; gap: 8px; flex: 1; flex-wrap: wrap; }
.stock-name  { font-size: 20px; font-weight: 700; }
.stock-code  { font-size: 14px; }
.industry-tag { background: #161b22; border: 1px solid #21262d; border-radius: 4px; padding: 1px 7px; font-size: 12px; }
.dash-rec    { font-weight: 700; font-size: 15px; }

.score-card  { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; }

.dcf-range { }
.range-labels { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.range-bar { margin: 4px 0 8px; }
.range-track { position: relative; height: 8px; background: linear-gradient(to right, #f85149, #d29922, #3fb950); border-radius: 4px; }
.price-marker { position: absolute; top: -10px; transform: translateX(-50%); color: #e6edf3; font-size: 12px; }
.range-note { font-size: 11px; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

.return-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.ret-item   { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ret-total  { margin-left: 8px; }
.ret-plus   { font-size: 18px; }

.sources-panel { }
.sources-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; margin-top: 8px; align-items: center; }
.warn-list { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
</style>
