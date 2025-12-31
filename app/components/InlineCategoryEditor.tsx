'use client'

import { useState, useRef, useEffect } from 'react'
import { CATEGORIES, isRecurringCategory, getCategoryColor, type Category } from '@/lib/constants/categories'

interface InlineCategoryEditorProps {
  transactionId: string
  currentCategory: string
  onCategoryChange: (transactionId: string, newCategory: string) => void
  onRecurringCategorySelected: (transactionId: string, category: string) => void
  disabled?: boolean
}

export function InlineCategoryEditor({
  transactionId,
  currentCategory,
  onCategoryChange,
  onRecurringCategorySelected,
  disabled = false,
}: InlineCategoryEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const filteredCategories = CATEGORIES.filter((cat) =>
    cat.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleCategorySelect = (category: string) => {
    if (isRecurringCategory(category)) {
      onRecurringCategorySelected(transactionId, category)
    } else {
      onCategoryChange(transactionId, category)
    }
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchTerm('')
    } else if (e.key === 'Enter' && !isOpen) {
      setIsOpen(true)
    } else if (e.key === 'Enter' && filteredCategories.length === 1) {
      handleCategorySelect(filteredCategories[0])
    }
  }

  const colors = getCategoryColor(currentCategory)

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
          disabled
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : `${colors.bg} ${colors.text} hover:opacity-80 cursor-pointer`
        }`}
        aria-label={`Category: ${currentCategory}. Press Enter to change.`}
      >
        {currentCategory}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg"
        >
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border-b border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="max-h-60 overflow-y-auto">
            {filteredCategories.map((category) => (
              <button
                key={category}
                onClick={() => handleCategorySelect(category)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors ${
                  category === currentCategory ? 'bg-blue-50 font-medium' : ''
                }`}
              >
                {category}
              </button>
            ))}
            {filteredCategories.length === 0 && (
              <div className="px-3 py-2 text-gray-500 text-sm">No categories found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
