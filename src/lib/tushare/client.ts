import { logger } from '../logger'

const DEFAULT_TUSHARE_URL = '/api/tushare/proxy'

type TushareResponse<T> = {
  code: number
  msg: string
  data?: {
    fields: string[]
    items: T[]
  }
}

export type TushareTable<T> = {
  fields: string[]
  items: T[]
}

function getApiUrl(): string {
  return import.meta.env.VITE_TUSHARE_PROXY_URL || DEFAULT_TUSHARE_URL
}

export function getTushareHealthUrl(): string {
  const apiUrl = getApiUrl()
  if (apiUrl.endsWith('/proxy')) {
    return apiUrl.slice(0, -'/proxy'.length) + '/health'
  }
  return `${apiUrl.replace(/\/$/, '')}/health`
}

export function toTsCode(raw: string): string {
  const clean = raw.trim().toUpperCase()
  if (clean.includes('.')) return clean
  if (clean.startsWith('6')) return `${clean}.SH`
  return `${clean}.SZ`
}

export async function tushareCall<T>(
  token: string,
  apiName: string,
  params: Record<string, string>,
  fields: string,
): Promise<TushareTable<T>> {
  logger.info('TuShare call triggered', { apiName, params, fields })

  const body = {
    api_name: apiName,
    token,
    params,
    fields,
  }

  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`TuShare 请求失败: HTTP ${response.status}`)
  }

  const json = (await response.json()) as TushareResponse<T>
  if (json.code !== 0) {
    throw new Error(`TuShare 返回错误: ${json.msg || json.code}`)
  }

  logger.info('TuShare call response', {
    apiName,
    code: json.code,
    rows: json.data?.items?.length || 0,
  })

  return {
    fields: json.data?.fields || [],
    items: json.data?.items || [],
  }
}

export async function tushareCallSafe<T>(
  token: string,
  apiName: string,
  params: Record<string, string>,
  fields: string,
): Promise<TushareTable<T>> {
  try {
    return await tushareCall<T>(token, apiName, params, fields)
  } catch (err) {
    logger.info(`TuShare safe call failed for ${apiName}`, { error: err instanceof Error ? err.message : err })
    return { fields: [], items: [] }
  }
}
