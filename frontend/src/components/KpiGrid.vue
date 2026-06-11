<template>
  <div class="kpi-grid">
    <slot />
  </div>
</template>
<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
</style>
