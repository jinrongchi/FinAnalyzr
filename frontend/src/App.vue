<template>
  <div id="app-root">
    <nav class="topnav">
      <div class="nav-brand">
        <span class="brand-icon">⬡</span>
        <span class="brand-name">DeepValue</span>
        <span class="brand-sub muted">A股价值投资</span>
      </div>
      <div class="nav-links">
        <RouterLink to="/analyzer" :class="{ active: $route.path.startsWith('/analyzer') }">估值分析</RouterLink>
        <RouterLink to="/scan" :class="{ active: $route.path === '/scan' }">批量扫描</RouterLink>
        <RouterLink to="/market" :class="{ active: $route.path === '/market' }">市场温度</RouterLink>
      </div>
      <div class="nav-status" v-if="isSetup">
        <span class="status-dot" :class="apiOk ? 'ok' : 'err'" />
        <span class="muted" style="font-size:12px">{{ apiOk ? 'API 连接正常' : 'API 不可用' }}</span>
      </div>
    </nav>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const apiOk = ref(false)
const isSetup = ref(false)

onMounted(async () => {
  try {
    await axios.get('/health', { timeout: 3000 })
    apiOk.value = true
  } catch {
    apiOk.value = false
  }
  isSetup.value = true
})
</script>

<style scoped>
.topnav {
  display: flex; align-items: center; gap: 24px;
  padding: 0 24px; height: 52px;
  background: var(--surface); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 50;
}
.nav-brand { display: flex; align-items: center; gap: 8px; }
.brand-icon { font-size: 20px; color: var(--accent); }
.brand-name { font-size: 16px; font-weight: 700; }
.brand-sub  { font-size: 12px; }

.nav-links { display: flex; gap: 4px; }
.nav-links a {
  padding: 6px 14px; border-radius: 6px; font-size: 14px;
  color: var(--muted); transition: all 0.15s;
}
.nav-links a:hover { background: rgba(255,255,255,0.05); color: var(--text); text-decoration: none; }
.nav-links a.active { background: rgba(88,166,255,0.1); color: var(--accent); }

.nav-status { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; }
.status-dot.ok  { background: var(--green); }
.status-dot.err { background: var(--red); }

main { flex: 1; }
</style>
