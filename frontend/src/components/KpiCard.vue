<template>
  <div class="kpi-card card">
    <div class="kpi-label muted">{{ label }}</div>
    <div class="kpi-value" :class="valueClass">{{ displayValue }}</div>
    <div v-if="sub" class="kpi-sub muted">{{ sub }}</div>
    <SourceBadge v-if="source" :source="source" style="margin-top:4px" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SourceBadge from '@/components/SourceBadge.vue'

const props = defineProps({
  label: String,
  value: [String, Number],
  sub: String,
  source: String,
  format: { type: String, default: 'auto' }, // auto | pct | cny | x
  colorize: { type: Boolean, default: false },
})

const displayValue = computed(() => {
  if (props.value == null) return '--'
  if (props.format === 'pct') return (props.value * 100).toFixed(1) + '%'
  if (props.format === 'cny') return '¥' + Number(props.value).toFixed(2)
  if (props.format === 'x')   return props.value.toFixed(2) + 'x'
  if (typeof props.value === 'number') return Number(props.value).toFixed(2)
  return props.value
})

const valueClass = computed(() => {
  if (!props.colorize || props.value == null) return ''
  return props.value > 0 ? 'text-green' : 'text-red'
})
</script>

<style scoped>
.kpi-card { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-value { font-size: 20px; font-weight: 700; }
.kpi-sub   { font-size: 11px; }
</style>
