import { createRouter, createWebHistory } from 'vue-router'
import StockAnalyzer from '@/views/StockAnalyzer.vue'
import ScanView from '@/views/ScanView.vue'
import MarketView from '@/views/MarketView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/analyzer' },
    { path: '/analyzer', component: StockAnalyzer },
    { path: '/analyzer/:tsCode', component: StockAnalyzer },
    { path: '/scan', component: ScanView },
    { path: '/market', component: MarketView },
  ]
})
