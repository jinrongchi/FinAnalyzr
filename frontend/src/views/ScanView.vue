<template>
  <div class="scan-view" style="max-width:1100px; margin:0 auto; padding:24px 16px;">
    <div class="scan-header" style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <h2 style="font-size:18px; font-weight:700;">批量扫描</h2>
      <span class="muted" style="font-size:13px;">基于最新估值快照排序</span>
    </div>

    <div class="card" style="padding:12px 16px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
      <button class="btn-primary" @click="triggerStockBasic" :disabled="syncBusy">
        {{ syncBusy ? '任务处理中…' : '同步股票基础数据' }}
      </button>
      <button class="btn-ghost" @click="triggerMacro" :disabled="syncBusy">同步宏观数据</button>
      <button class="btn-ghost" @click="refreshSyncStatus">刷新状态</button>
      <span class="muted" style="font-size:12px;">状态每3秒自动刷新</span>
    </div>

    <div class="card" style="padding:12px 16px; margin-bottom:14px;">
      <div style="font-size:13px; font-weight:600; margin-bottom:8px;">同步任务状态</div>
      <div style="display:grid; grid-template-columns: 180px 120px 1fr; gap:8px; font-size:12px;">
        <template v-for="task in ['sync_stock_basic', 'sync_macro']" :key="task">
          <div class="mono">{{ task }}</div>
          <div :class="stateClass(syncStatus[task]?.state)">{{ syncStatus[task]?.state || 'idle' }}</div>
          <div class="muted">
            <span v-if="syncStatus[task]?.error">错误: {{ syncStatus[task].error }}</span>
            <span v-else-if="syncStatus[task]?.finished_at">完成: {{ formatTime(syncStatus[task].finished_at) }}</span>
            <span v-else-if="syncStatus[task]?.started_at">开始: {{ formatTime(syncStatus[task].started_at) }}</span>
            <span v-else>尚未触发</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Filters -->
    <div class="card" style="padding:12px 16px; display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
      <select v-model="filters.industry_group" @change="load">
        <option value="">全部行业</option>
        <option v-for="(l, v) in INDUSTRY_LABELS" :key="v" :value="v">{{ l }}</option>
      </select>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
        <input type="number" v-model.number="filters.min_score" @change="load" style="width:70px" placeholder="最低评分" />
        –
        <input type="number" v-model.number="filters.max_score" @change="load" style="width:70px" placeholder="最高评分" />
        <span class="muted">评分区间</span>
      </label>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
        <input type="checkbox" v-model="filters.exclude_st" @change="load" />
        <span>排除ST</span>
      </label>
      <button class="btn-primary" @click="load" :disabled="loading">{{ loading ? '加载中…' : '刷新' }}</button>
    </div>

    <div v-if="loading" class="muted" style="text-align:center; padding:40px;">加载中…</div>
    <div v-else-if="!stocks.length" class="muted" style="text-align:center; padding:40px;">
      暂无数据。请先运行股票数据同步，然后访问各股票估值页面生成快照。
    </div>
    <div v-else class="card" style="padding:0; overflow:hidden;">
      <table>
        <thead>
          <tr>
            <th>代码</th><th>名称</th><th>行业</th>
            <th style="text-align:right">综合评分</th>
            <th style="text-align:right">安全边际</th>
            <th style="text-align:right">DCF基准价</th>
            <th>建议</th><th>红旗</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in stocks" :key="s.ts_code" style="cursor:pointer" @click="goAnalyze(s.ts_code)">
            <td class="mono">{{ s.ts_code }}</td>
            <td>{{ s.name }}<span v-if="s.is_st" class="flag-warning" style="font-size:11px; margin-left:4px">ST</span></td>
            <td class="muted">{{ INDUSTRY_LABELS[s.industry_group] || s.industry_group }}</td>
            <td style="text-align:right">
              <span :class="scoreClass(s.composite_score)" style="font-weight:700">{{ s.composite_score?.toFixed(1) ?? '--' }}</span>
            </td>
            <td style="text-align:right" :class="s.margin_of_safety >= 0 ? 'text-green' : 'text-red'">
              {{ s.margin_of_safety != null ? (s.margin_of_safety * 100).toFixed(1) + '%' : '--' }}
            </td>
            <td style="text-align:right" class="mono">{{ s.dcf_base != null ? '¥' + s.dcf_base.toFixed(2) : '--' }}</td>
            <td>{{ REC_LABELS[s.recommendation] || s.recommendation }}</td>
            <td>
              <span v-for="f in (s.red_flags || []).slice(0,3)" :key="f.code" :class="`flag-${f.level}`" style="font-size:11px; margin-right:4px">{{ f.level === 'reject' ? '🔴' : '🟡' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { scanApi, syncApi } from '@/api'

const router = useRouter()
const loading = ref(false)
const stocks = ref([])
const filters = reactive({ industry_group: '', min_score: 0, max_score: 100, exclude_st: true })
const syncStatus = ref({})
let syncTimer = null

const syncBusy = computed(() => {
  const stockState = syncStatus.value?.sync_stock_basic?.state
  const macroState = syncStatus.value?.sync_macro?.state
  return stockState === 'running' || macroState === 'running'
})

const INDUSTRY_LABELS = {
  consumer_pharma: '消费&医药', financial_re: '金融&地产',
  cyclical_materials: '周期材料', utilities_infra: '公用事业',
  technology: 'TMT科技', industrial: '工业制造', other: '其他',
}
const REC_LABELS = { do_not_invest: '拒绝', watch: '观察', fairly_valued: '合理', attractive: '吸引', very_attractive: '强烈推荐' }
const scoreClass = (s) => s >= 65 ? 'text-green' : s >= 40 ? 'text-yellow' : 'text-red'

function stateClass(state) {
  if (state === 'running') return 'text-yellow'
  if (state === 'success') return 'text-green'
  if (state === 'failed') return 'text-red'
  return 'muted'
}

function formatTime(v) {
  if (!v) return '--'
  return new Date(v).toLocaleString()
}

async function refreshSyncStatus() {
  const res = await syncApi.statusAll()
  syncStatus.value = res.data || {}
}

async function triggerStockBasic() {
  await syncApi.stockBasic()
  await refreshSyncStatus()
}

async function triggerMacro() {
  await syncApi.macro()
  await refreshSyncStatus()
}

async function load() {
  loading.value = true
  try {
    const res = await scanApi.scan({
      industry_group: filters.industry_group || undefined,
      min_score: filters.min_score,
      max_score: filters.max_score,
      exclude_st: filters.exclude_st,
      limit: 100,
    })
    stocks.value = res.data
  } catch (e) {
    stocks.value = []
  } finally {
    loading.value = false
  }
}

function goAnalyze(tsCode) { router.push(`/analyzer/${tsCode}`) }
onMounted(async () => {
  await load()
  await refreshSyncStatus()
  syncTimer = setInterval(refreshSyncStatus, 3000)
})

onUnmounted(() => {
  if (syncTimer) clearInterval(syncTimer)
})
</script>
