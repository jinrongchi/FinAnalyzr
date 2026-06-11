import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { valuationApi, stocksApi, marketApi } from '@/api'

export const useValuationStore = defineStore('valuation', () => {
  const loading = ref(false)
  const error = ref(null)
  const result = ref(null)
  const currentStock = ref(null)

  async function fetchValuation(tsCode, forceRefresh = false) {
    loading.value = true
    error.value = null
    result.value = null
    try {
      const res = await valuationApi.get(tsCode, forceRefresh)
      result.value = res.data
    } catch (e) {
      error.value = e.response?.data?.detail || e.message || '估值请求失败'
    } finally {
      loading.value = false
    }
  }

  return { loading, error, result, currentStock, fetchValuation }
})

export const useMarketStore = defineStore('market', () => {
  const erpData = ref(null)
  const cn10y = ref(null)

  async function fetchERP() {
    const res = await marketApi.erp()
    erpData.value = res.data
  }
  async function fetchCn10y() {
    const res = await marketApi.cn10y()
    cn10y.value = res.data
  }

  return { erpData, cn10y, fetchERP, fetchCn10y }
})
