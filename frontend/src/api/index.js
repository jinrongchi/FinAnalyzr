import axios from 'axios'

const http = axios.create({ baseURL: '/api/v1', timeout: 30000 })

export const stocksApi = {
  list: (params = {}) => http.get('/stocks/', { params }),
  get: (tsCode) => http.get(`/stocks/${tsCode}`),
}

export const valuationApi = {
  get: (tsCode, forceRefresh = false) =>
    http.get(`/valuation/${tsCode}`, { params: { force_refresh: forceRefresh } }),
}

export const scanApi = {
  scan: (params = {}) => http.get('/scan/', { params }),
}

export const marketApi = {
  erp: () => http.get('/market/erp'),
  cn10y: () => http.get('/market/cn10y'),
}

export const manualApi = {
  fields: () => http.get('/manual/fields'),
  get: (tsCode) => http.get(`/manual/${tsCode}`),
  save: (tsCode, body) => http.put(`/manual/${tsCode}`, body),
  delete: (tsCode, fieldName) => http.delete(`/manual/${tsCode}/${fieldName}`),
}

export const syncApi = {
  stockBasic: () => http.post('/sync/stock-basic'),
  stock: (tsCode) => http.post(`/sync/stock/${tsCode}`),
  macro: () => http.post('/sync/macro'),
}
