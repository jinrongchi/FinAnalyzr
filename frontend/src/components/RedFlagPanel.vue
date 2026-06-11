<template>
  <div class="red-flags" v-if="flags && flags.length">
    <div v-for="f in flags" :key="f.code" :class="['flag-item', `flag-${f.level}`]">
      <span class="flag-icon">{{ ICONS[f.level] }}</span>
      <span class="flag-msg">{{ f.message }}</span>
      <span v-if="f.value != null" class="flag-val mono">{{ fmt(f.value) }}</span>
    </div>
  </div>
  <div v-else class="muted" style="font-size:13px">无红旗警告</div>
</template>

<script setup>
const props = defineProps({ flags: Array })
const ICONS = { reject: '🔴', warning: '🟡', caution: '🔵', ok: '✅' }
const fmt = (v) => typeof v === 'number' ? (v > 1 ? v.toFixed(1) : (v * 100).toFixed(1) + '%') : v
</script>

<style scoped>
.red-flags { display: flex; flex-direction: column; gap: 8px; }
.flag-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 12px; border-radius: 6px; font-size: 13px;
}
.flag-icon { flex-shrink: 0; margin-top: 1px; }
.flag-msg  { flex: 1; }
.flag-val  { flex-shrink: 0; font-size: 12px; }
</style>
