'use client'

import { useState, useRef, useEffect } from 'react'

interface InlineDescriptionEditorProps {
  transactionId: string
  rawDescription: string
  userDescription: string | null
  onDescriptionChange: (transactionId: string, newDescription: string | null) => void
  disabled?: boolean
}

export function InlineDescriptionEditor({
  transactionId,
  rawDescription,
  userDescription,
  onDescriptionChange,
  disabled = false,
}: InlineDescriptionEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(userDescription || rawDescription)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayText = userDescription || rawDescription
  const isCustomized = !!userDescription

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    const trimmed = editValue.trim()
    if (trimmed === rawDescription) {
      // Reset to original if same as raw
      onDescriptionChange(transactionId, null)
    } else if (trimmed && trimmed !== rawDescription) {
      onDescriptionChange(transactionId, trimmed)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(userDescription || rawDescription)
    setIsEditing(false)
  }

  const handleReset = () => {
    onDescriptionChange(transactionId, null)
    setEditValue(rawDescription)
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
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="flex-1 rounded-md border border-line px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          disabled={disabled}
        />
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2">
      <button
        onClick={() => !disabled && setIsEditing(true)}
        disabled={disabled}
        className={`text-left transition ${
          disabled ? 'cursor-not-allowed text-monday-3pm' : 'cursor-pointer hover:text-foreground'
        }`}
        title={isCustomized ? `Original: ${rawDescription}` : undefined}
      >
        <span className={isCustomized ? 'font-semibold' : ''}>{displayText}</span>
        {isCustomized && (
          <span className="ml-1 text-xs text-accent" title="Custom description">
            ✎
          </span>
        )}
      </button>
      {isCustomized && !disabled && (
        <button
          onClick={handleReset}
          className="opacity-0 group-hover:opacity-100 text-xs text-monday-3pm hover:text-foreground transition-opacity"
          title="Reset to original"
        >
          ↺
        </button>
      )}
    </div>
  )
}
