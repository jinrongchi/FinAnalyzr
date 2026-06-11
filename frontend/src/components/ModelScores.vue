<template>
  <div class="model-scores">
    <div v-for="ms in scores" :key="ms.model" class="ms-row">
      <div class="ms-header">
        <span class="ms-name">{{ MODEL_LABELS[ms.model] || ms.model }}</span>
        <SourceBadge :source="ms.source" />
        <span class="ms-weight muted">权重 {{ pct(ms.weight) }}</span>
      </div>
      <div class="ms-bar-wrap">
        <div class="ms-bar-bg">
          <div class="ms-bar-fill" :style="{ width: barWidth(ms.score), background: barColor(ms.score) }" />
        </div>
        <span class="ms-score" :style="{ color: barColor(ms.score) }">
          {{ ms.score != null ? Math.round(ms.score) : 'N/A' }}
        </span>
        <span class="ms-contrib muted">贡献 {{ ms.contribution != null ? Math.round(ms.contribution) : '--' }}</span>
      </div>
      <div v-if="ms.notes" class="ms-notes muted">{{ ms.notes }}</div>
    </div>
  </div>
</template>

<script setup>
import SourceBadge from '@/components/SourceBadge.vue'

defineProps({ scores: Array })

const MODEL_LABELS = {
  dcf: 'DCF 现金流折现',
  roe_pb: 'ROE-PB 净资产收益',
  pe_percentile: 'PE 历史分位',
  pb_percentile: 'PB 历史分位',
  cape: 'CAPE 席勒PE',
  peg: 'PEG 成长估值',
  dividend_yield: '股息收益率',
  pcf_percentile: 'PCF 现金流倍数',
}

const pct = (v) => v != null ? (v * 100).toFixed(0) + '%' : '--'
const barWidth = (s) => s != null ? Math.max(2, s) + '%' : '0%'
const barColor = (s) => {
  if (s == null) return '#7d8590'
  if (s >= 65) return '#3fb950'
  if (s >= 40) return '#d29922'
  return '#f85149'
}
</script>

<style scoped>
.model-scores { display: flex; flex-direction: column; gap: 12px; }
.ms-row { display: flex; flex-direction: column; gap: 4px; }
.ms-header { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ms-name { font-weight: 500; }
.ms-weight { margin-left: auto; font-size: 12px; }
.ms-bar-wrap { display: flex; align-items: center; gap: 8px; }
.ms-bar-bg { flex: 1; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
.ms-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.ms-score { font-size: 13px; font-weight: 600; min-width: 28px; text-align: right; }
.ms-contrib { font-size: 12px; min-width: 60px; text-align: right; }
.ms-notes { font-size: 11px; padding-left: 2px; }
</style>
