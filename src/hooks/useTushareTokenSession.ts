import { useState } from 'react'

type UseTushareTokenSessionOptions = {
  token: string
  setToken: (value: string) => void
  setSyncStatus: (value: string) => void
}

export function useTushareTokenSession(options: UseTushareTokenSessionOptions) {
  const [editingToken, setEditingToken] = useState(false)
  const [tokenDraft, setTokenDraft] = useState(options.token)

  function handleSaveToken(): void {
    options.setToken(tokenDraft)
    setEditingToken(false)
    options.setSyncStatus(tokenDraft.trim() ? 'Token Saved' : 'Token cleared')
  }

  function handleChangeToken(): void {
    setTokenDraft(options.token)
    setEditingToken(true)
  }

  function handleClearToken(): void {
    options.setToken('')
    setTokenDraft('')
    setEditingToken(false)
    options.setSyncStatus('Token cleared')
  }

  function handleCancelTokenEdit(): void {
    setEditingToken(false)
  }

  return {
    editingToken,
    tokenDraft,
    setTokenDraft,
    handleSaveToken,
    handleChangeToken,
    handleClearToken,
    handleCancelTokenEdit,
  }
}