import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { DEFAULT_FORM } from '../../src/data/defaults'

function mockHealthWithoutServerToken(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/tushare/health') || url.endsWith('/health')) {
      return new Response(JSON.stringify({ ok: true, hasServerToken: false }), { status: 200 })
    }
    return new Response('', { status: 500 })
  })
}

describe('App integration', () => {
  it('renders top navigation and analyzer defaults', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: '估值工具' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '股票历史' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '历史复盘' })).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: '输入参数' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存当前快照' })).toBeInTheDocument()
  })

  it('switches between analyzer, history, and review views', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '股票历史' }))
    expect(screen.getByRole('heading', { name: '股票搜索历史' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '历史复盘' }))
    expect(screen.getByRole('heading', { name: '历史快照' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '估值工具' }))
    expect(screen.getByRole('heading', { name: '输入参数' })).toBeInTheDocument()
  })

  it('saves and deletes a snapshot in review view', async () => {
    render(<App />)

    fireEvent.change(screen.getByRole('textbox', { name: '股票代码' }), { target: { value: '600519' } })
    fireEvent.click(screen.getByRole('button', { name: '保存当前快照' }))

    fireEvent.click(screen.getByRole('button', { name: '历史复盘' }))
    const titleNodes = await screen.findAllByText(/600519 N\/A/)
    expect(titleNodes.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(screen.getByText('暂无快照，请先在估值页保存。')).toBeInTheDocument()
    })
  })

  it('loads selected history entry into analyzer form', () => {
    const seededHistory = [
      {
        id: '600519',
        ticker: '600519',
        stockName: '贵州茅台',
        sourceTradeDate: '20240605',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        form: {
          ...DEFAULT_FORM,
          ticker: '600519',
          price: 1800,
        },
      },
    ]

    window.localStorage.setItem('finanalyzr.search-history.v1', JSON.stringify(seededHistory))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '股票历史' }))
    fireEvent.click(screen.getByRole('button', { name: '进入估值页' }))

    expect(screen.getByRole('heading', { name: '输入参数' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '股票代码' })).toHaveValue('600519')
  })

  it('overwrites existing snapshot when user confirms', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    fireEvent.change(screen.getByRole('textbox', { name: '股票代码' }), { target: { value: '600519' } })
    fireEvent.change(screen.getByRole('textbox', { name: '快照名称' }), { target: { value: 'My Snapshot' } })

    fireEvent.click(screen.getByRole('button', { name: '保存当前快照' }))
    fireEvent.click(screen.getByRole('button', { name: '保存当前快照' }))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('已覆盖同名快照：My Snapshot').length).toBeGreaterThan(0)

    const snapshots = JSON.parse(window.localStorage.getItem('finanalyzr.snapshots.v1') || '[]')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.label).toBe('My Snapshot')
  })

  it('shows error message when history refresh fails', async () => {
    const seededHistory = [
      {
        id: '000001',
        ticker: '000001',
        stockName: '平安银行',
        sourceTradeDate: '20240101',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        form: {
          ...DEFAULT_FORM,
          ticker: '000001',
        },
      },
    ]

    window.localStorage.setItem('finanalyzr.search-history.v1', JSON.stringify(seededHistory))
    mockHealthWithoutServerToken()

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '股票历史' }))
    fireEvent.click(screen.getByRole('button', { name: '更新数据' }))

    expect(await screen.findByText(/历史数据更新失败/)).toBeInTheDocument()
  })

  it('uses server-side token when UI token is empty and allows UI override', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/tushare/health') || url.endsWith('/health')) {
        return new Response(JSON.stringify({ ok: true, hasServerToken: true }), { status: 200 })
      }
      return new Response('', { status: 500 })
    })

    render(<App />)

    expect(await screen.findByText('the token is already set from server side')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load from TuShare' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Set Token' }))
    fireEvent.change(screen.getByPlaceholderText('输入 TuShare Token'), {
      target: { value: 'ui-token-override' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Token' }))

    expect(screen.getAllByText('Token Saved').length).toBeGreaterThan(0)
    expect(window.localStorage.getItem('finanalyzr.tushare-token.v1')).toBe('ui-token-override')
  })

  it('keeps load button disabled until token is saved', () => {
    render(<App />)

    const loadButton = screen.getByRole('button', { name: 'Load from TuShare' })
    expect(loadButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Set Token' }))
    fireEvent.change(screen.getByPlaceholderText('输入 TuShare Token'), {
      target: { value: 'token-abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Token' }))

    expect(screen.getAllByText('Token Saved').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Load from TuShare' })).toBeEnabled()
  })

  it('remembers TuShare token across app remounts', () => {
    const first = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Set Token' }))
    fireEvent.change(screen.getByPlaceholderText('输入 TuShare Token'), {
      target: { value: 'test-token-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Token' }))

    expect(screen.getAllByText('Token Saved').length).toBeGreaterThan(0)

    first.unmount()
    render(<App />)

    expect(screen.getAllByText('Token Saved').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Change Token' }))
    expect(screen.getByPlaceholderText('输入 TuShare Token')).toHaveValue('test-token-123')
  })

  it('clears saved token with one click and disables load button again', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Set Token' }))
    fireEvent.change(screen.getByPlaceholderText('输入 TuShare Token'), {
      target: { value: 'test-token-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Token' }))

    expect(screen.getByRole('button', { name: 'Load from TuShare' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Token' }))

    expect(screen.getByRole('button', { name: 'Set Token' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load from TuShare' })).toBeDisabled()
  })
})
