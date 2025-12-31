'use client'

import { useEffect, useRef, useState } from 'react'

interface InlineNoteEditorProps {
  transactionId: string
  note: string | null
  onNoteChange: (transactionId: string, note: string | null) => void
  disabled?: boolean
}

export function InlineNoteEditor({
  transactionId,
  note,
  onNoteChange,
  disabled = false,
}: InlineNoteEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(note || '')
  const inputRef = useRef<HTMLInputElement>(null)

  const hasNote = !!(note && note.trim())

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) {
      setEditValue(note || '')
    }
  }, [note, isEditing])

  const handleSave = () => {
    const trimmed = editValue.trim()
    onNoteChange(transactionId, trimmed ? trimmed : null)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(note || '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mt-1">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="flex-1 px-2 py-1 border border-cubicle-taupe rounded focus:outline-none focus:ring-2 focus:ring-dark text-xs"
          disabled={disabled}
          placeholder="Add a note"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => !disabled && setIsEditing(true)}
      disabled={disabled}
      className={`mt-1 text-left text-xs ${disabled ? 'cursor-not-allowed text-monday-3pm' : 'text-monday-3pm hover:text-dark'}`}
    >
      {hasNote ? `Note: ${note}` : 'Add note'}
    </button>
  )
}
