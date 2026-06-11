<template>
  <span :class="['src-badge', badgeClass]" :title="tooltip">{{ label }}</span>
</template>

<script setup>
const props = defineProps({ source: String })
const MAP = {
  auto:        { cls: 'badge-auto',    label: 'AUTO',    tip: '自动从Tushare获取' },
  calc:        { cls: 'badge-calc',    label: 'CALC',    tip: '由Tushare数据计算' },
  manual:      { cls: 'badge-manual',  label: '手工',    tip: '用户手工录入' },
  default:     { cls: 'badge-default', label: 'DEFAULT', tip: '系统默认值（优先级最低）' },
  unavailable: { cls: 'badge-unavailable', label: 'N/A', tip: '数据不可用' },
}
const entry = computed(() => MAP[props.source] || MAP.unavailable)
const badgeClass = computed(() => entry.value.cls)
const label = computed(() => entry.value.label)
const tooltip = computed(() => entry.value.tip)
</script>

<script>
import { computed } from 'vue'
export default {}
</script>
