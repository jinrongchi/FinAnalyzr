<template>
  <div class="analyzer">
    <!-- Search bar -->
    <div class="search-bar card">
      <input
        v-model="query"
        @input="onSearch"
        @keydown.enter="selectFirst"
        placeholder="输入股票代码或名称 (如 600519 / 贵州茅台)"
        class="search-input"
        autocomplete="off"
      />
      <button class="btn-primary" @click="analyze" :disabled="!selectedCode || store.loading">
        {{ store.loading ? '计算中…' : '估值分析' }}
      </button>
      <button class="btn-ghost" @click="syncStock" :disabled="!selectedCode || syncing" title="从Tushare同步最新数据">
        {{ syncing ? '同步中…' : '↻ 刷新数据' }}
      </button>

      <!-- Dropdown -->
      <ul v-if="suggestions.length" class="suggestions card">
        <li
          v-for="s in suggestions"
          :key="s.ts_code"
          @mousedown.prevent="selectStock(s)"
          class="suggestion-item"
        >
          <span class="sug-code mono">{{ s.ts_code }}</span>
          <span class="sug-name">{{ s.name }}</span>
          <span class="sug-ind muted">{{ s.industry }}</span>
          <span v-if="s.is_st" class="flag-warning" style="font-size:11px">ST</span>
        </li>
      </ul>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="error-banner card">⚠️ {{ store.error }}</div>

    <!-- Loading skeleton -->
    <div v-if="store.loading" class="loading-state muted">正在计算估值…</div>

    <!-- Result -->
    <template v-if="store.result && !store.loading">
      <ValuationDashboard :result="store.result" />
    </template>

    <!-- Empty state -->
    <div v-if="!store.result && !store.loading && !store.error" class="empty-state muted">
      搜索股票代码后点击「估值分析」开始
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useValuationStore } from '@/stores'
import { stocksApi, syncApi } from '@/api'
import ValuationDashboard from '@/components/ValuationDashboard.vue'

const store = useValuationStore()
const router = useRouter()
const route = useRoute()

const query = ref('')
const selectedCode = ref(route.params.tsCode || '')
const suggestions = ref([])
const syncing = ref(false)

let searchTimer = null
async function onSearch() {
  clearTimeout(searchTimer)
  if (!query.value.trim()) { suggestions.value = []; return }
  searchTimer = setTimeout(async () => {
    const res = await stocksApi.list({ q: query.value, limit: 8 })
    suggestions.value = res.data
  }, 250)
}

function selectFirst() {
  if (suggestions.value.length) selectStock(suggestions.value[0])
  else analyze()
}

function selectStock(s) {
  query.value = `${s.ts_code} ${s.name}`
  selectedCode.value = s.ts_code
  suggestions.value = []
  analyze()
}

async function analyze() {
  if (!selectedCode.value) return
  router.replace(`/analyzer/${selectedCode.value}`)
  await store.fetchValuation(selectedCode.value)
}

async function syncStock() {
  if (!selectedCode.value) return
  syncing.value = true
  try {
    await syncApi.stock(selectedCode.value)
    await store.fetchValuation(selectedCode.value, true)
  } finally {
    syncing.value = false
  }
}

// Auto-load from route param
if (route.params.tsCode) {
  selectedCode.value = route.params.tsCode
  query.value = route.params.tsCode
  store.fetchValuation(route.params.tsCode)
}
</script>

<style scoped>
.analyzer { max-width: 1100px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 16px; }

.search-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; position: relative;
}
.search-input { flex: 1; font-size: 15px; }

.suggestions {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
  margin-top: 4px; max-height: 300px; overflow-y: auto;
  list-style: none; padding: 4px 0;
}
.suggestion-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 16px;
  cursor: pointer; transition: background 0.1s;
}
.suggestion-item:hover { background: rgba(88,166,255,0.05); }
.sug-code { font-size: 13px; min-width: 90px; }
.sug-name { flex: 1; }
.sug-ind  { font-size: 12px; }

.error-banner { color: var(--red); border-color: #5a0000; padding: 12px 16px; }
.loading-state { text-align: center; padding: 48px; font-size: 15px; }
.empty-state   { text-align: center; padding: 80px; font-size: 15px; }
</style>
