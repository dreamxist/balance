import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import { useUpdateBalance } from '@/hooks/use-update-balance'

interface InlineBalanceEditProps {
  value: number
  accountId: string
  accountName: string
  className?: string
}

function parseIntegerAmount(raw: string): number | null {
  const cleaned = raw.replace(/[.\s]/g, '').replace(/,/g, '')
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n)
}

export function InlineBalanceEdit({ value, accountId, accountName, className }: InlineBalanceEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useUpdateBalance()
  const savingRef = useRef(false)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  function handleStartEdit() {
    setEditValue(String(value))
    setIsEditing(true)
    savingRef.current = false
  }

  function handleSave() {
    if (savingRef.current) return
    savingRef.current = true

    const parsed = parseIntegerAmount(editValue)
    setIsEditing(false)

    if (parsed === null || parsed === value) return

    mutation.mutate({
      accountId,
      newBalance: parsed,
      previousBalance: value,
      accountName,
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      savingRef.current = true
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={cn(
          'bg-transparent font-mono text-sm tabular-nums text-right outline-none',
          'w-full max-w-[12ch] rounded-sm px-1 -mx-1',
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      className={cn(
        'cursor-pointer font-mono text-sm tabular-nums rounded-sm px-1 -mx-1 transition-colors',
        'hover:bg-muted text-right',
        value < 0 ? 'text-red-500' : 'text-foreground',
        className,
      )}
    >
      {formatMoney(value)}
    </button>
  )
}
