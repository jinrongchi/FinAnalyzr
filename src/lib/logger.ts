type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function readLevel(): LogLevel {
  const raw = (import.meta.env.VITE_LOG_LEVEL || '').toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return import.meta.env.MODE === 'test' ? 'error' : 'info'
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[readLevel()]
}

function withTag(args: unknown[]): unknown[] {
  return ['[FinAnalyzr]', ...args]
}

export const logger = {
  debug(...args: unknown[]) {
    if (shouldLog('debug')) console.debug(...withTag(args))
  },
  info(...args: unknown[]) {
    if (shouldLog('info')) console.info(...withTag(args))
  },
  warn(...args: unknown[]) {
    if (shouldLog('warn')) console.warn(...withTag(args))
  },
  error(...args: unknown[]) {
    if (shouldLog('error')) console.error(...withTag(args))
  },
}
