type StorageDriver = 'local' | 'session'

const DEFAULT_NAMESPACE = 'finanalyzr'
const MEMORY_FALLBACK = new Map<string, string>()

function readDriver(): StorageDriver {
  const raw = (import.meta.env.VITE_STORAGE_DRIVER || 'local').toLowerCase()
  return raw === 'session' ? 'session' : 'local'
}

function isStorageAvailable(candidate: Storage): boolean {
  try {
    const key = '__finanalyzr_storage_probe__'
    candidate.setItem(key, '1')
    candidate.removeItem(key)
    return true
  } catch {
    return false
  }
}

function memoryStorage(): Storage {
  return {
    get length() {
      return MEMORY_FALLBACK.size
    },
    clear() {
      MEMORY_FALLBACK.clear()
    },
    getItem(key: string) {
      return MEMORY_FALLBACK.has(key) ? MEMORY_FALLBACK.get(key)! : null
    },
    key(index: number) {
      return Array.from(MEMORY_FALLBACK.keys())[index] || null
    },
    removeItem(key: string) {
      MEMORY_FALLBACK.delete(key)
    },
    setItem(key: string, value: string) {
      MEMORY_FALLBACK.set(key, String(value))
    },
  }
}

export function getStorage(): Storage {
  const hasWindow = typeof window !== 'undefined'
  if (!hasWindow) return memoryStorage()

  const driver = readDriver()
  const preferred = driver === 'session' ? window.sessionStorage : window.localStorage
  if (isStorageAvailable(preferred)) return preferred

  const fallback = driver === 'session' ? window.localStorage : window.sessionStorage
  if (isStorageAvailable(fallback)) return fallback

  return memoryStorage()
}

export function getStorageKey(suffix: string): string {
  const namespace = (import.meta.env.VITE_STORAGE_NAMESPACE || DEFAULT_NAMESPACE).trim() || DEFAULT_NAMESPACE
  return `${namespace}.${suffix}`
}
