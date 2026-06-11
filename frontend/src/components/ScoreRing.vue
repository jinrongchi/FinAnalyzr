<template>
  <div class="score-ring" :title="`综合评分: ${score}`">
    <svg :width="size" :height="size" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" fill="none" stroke="#21262d" stroke-width="10"/>
      <circle
        cx="50" cy="50" r="40"
        fill="none"
        :stroke="color"
        stroke-width="10"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        transform="rotate(-90 50 50)"
        style="transition: stroke-dashoffset 0.6s ease"
      />
    </svg>
    <div class="score-label">
      <span class="score-num" :style="{ color }">{{ displayScore }}</span>
      <span class="score-sub">/ 100</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ score: { type: Number, default: 0 }, size: { type: Number, default: 120 } })
const circumference = 2 * Math.PI * 40
const offset = computed(() => circumference - (props.score / 100) * circumference)
const color = computed(() => {
  if (props.score >= 65) return '#3fb950'
  if (props.score >= 40) return '#d29922'
  return '#f85149'
})
const displayScore = computed(() => props.score != null ? Math.round(props.score) : '--')
</script>

<style scoped>
.score-ring { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.score-ring svg { display: block; }
.score-label {
  position: absolute;
  display: flex; flex-direction: column; align-items: center;
  line-height: 1.2;
}
.score-num { font-size: 24px; font-weight: 700; }
.score-sub { font-size: 11px; color: var(--muted); }
</style>
