<template>
  <div style="max-width:900px; margin:0 auto; padding:24px 16px; display:flex; flex-direction:column; gap:16px;">
    <h2 style="font-size:18px; font-weight:700;">市场温度计</h2>

    <!-- ERP KPI -->
    <KpiGrid>
      <KpiCard label="当前ERP" :value="erpData?.current_erp" format="pct" source="calc" />
      <KpiCard label="ERP历史分位" :value="erpData?.erp_percentile" format="pct" source="calc" />
      <KpiCard label="10年期国债" :value="cn10y?.cn10y_yield" format="pct" :source="cn10y?.source" />
      <div class="card" style="display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; padding:12px;">
        <span :class="statusClass">{{ STATUS_LABELS[erpData?.status] || '--' }}</span>
      </div>
    </KpiGrid>

    <!-- ERP signal explanation -->
    <div class="card" style="font-size:13px; line-height:1.7; color:var(--muted);">
      <strong style="color:var(--text)">ERP（股债利差）含义：</strong>
      沪深300盈利收益率（1/PE_TTM）减去10年国债收益率。
      ERP越高代表A股相对债券越便宜。历史 90th 分位以上为极度低估信号（+10%评分加成），
      10th 分位以下为极度高估（-10%评分惩罚）。
    </div>

    <!-- ERP chart -->
    <div class="card" style="padding:16px;">
      <div class="section-title">ERP 近期走势</div>
      <v-chart v-if="chartOption" :option="chartOption" style="height:260px;" autoresize />
      <div v-else class="muted" style="text-align:center; padding:40px;">
        暂无历史数据。请先同步 /api/v1/sync/macro。
      </div>
    </div>

    <!-- Sync buttons -->
    <div style="display:flex; gap:10px;">
      <button class="btn-ghost" @click="syncMacro" :disabled="syncing">{{ syncing ? '同步中…' : '↻ 同步宏观数据' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useMarketStore } from '@/stores'
import { syncApi } from '@/api'
import KpiGrid from '@/components/KpiGrid.vue'
import KpiCard from '@/components/KpiCard.vue'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const market = useMarketStore()
const syncing = ref(false)
const erpData = computed(() => market.erpData)
const cn10y = computed(() => market.cn10y)

const STATUS_LABELS = {
  extreme_undervalue: '🟢 极度低估',
  undervalue:         '🟢 低估',
  neutral:            '⚪ 中性',
  overvalue:          '🔴 高估',
  extreme_overvalue:  '🔴 极度高估',
  no_data:            '--',
}
const statusClass = computed(() => {
  const s = erpData.value?.status
  if (!s || s === 'no_data') return 'muted'
  if (s.includes('undervalue')) return 'text-green'
  if (s.includes('overvalue'))  return 'text-red'
  return ''
})

const chartOption = computed(() => {
  const series = erpData.value?.erp_series
  if (!series?.length) return null
  return {
    backgroundColor: 'transparent',
    grid: { top: 20, right: 20, bottom: 40, left: 50 },
    xAxis: {
      type: 'category',
      data: series.map(p => p.date),
      axisLine: { lineStyle: { color: '#21262d' } },
      axisLabel: { color: '#7d8590', fontSize: 11 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#21262d' } },
      axisLabel: { color: '#7d8590', fontSize: 11, formatter: v => (v * 100).toFixed(1) + '%' },
      splitLine: { lineStyle: { color: '#21262d' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#161b22',
      borderColor: '#21262d',
      textStyle: { color: '#e6edf3' },
      formatter: ([p]) => `${p.axisValue}<br/>ERP: ${(p.value * 100).toFixed(2)}%`
    },
    series: [{
      data: series.map(p => p.erp),
      type: 'line',
      smooth: true,
      lineStyle: { color: '#58a6ff', width: 2 },
      areaStyle: { color: 'rgba(88,166,255,0.08)' },
      symbol: 'none',
    }]
  }
})

async function syncMacro() {
  syncing.value = true
  try { await syncApi.macro() } finally { syncing.value = false }
  await market.fetchERP()
  await market.fetchCn10y()
}

onMounted(async () => {
  await market.fetchERP()
  await market.fetchCn10y()
})
</script>

<style scoped>
.section-title { font-weight: 600; font-size: 13px; margin-bottom: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
</style>
