import { getStorage, getStorageKey } from './storage'

const STORAGE = getStorage()
const TOKEN_STORAGE_KEY = getStorageKey('tushare-token.v1')

export function loadTushareToken(): string {
  return STORAGE.getItem(TOKEN_STORAGE_KEY) || ''
}

export function persistTushareToken(token: string): void {
  if (!token.trim()) {
    STORAGE.removeItem(TOKEN_STORAGE_KEY)
    return
  }
  STORAGE.setItem(TOKEN_STORAGE_KEY, token)
}
