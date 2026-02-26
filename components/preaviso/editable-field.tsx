"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

type EditableFieldType = 'text' | 'textarea' | 'enum' | 'boolean' | 'list'

interface EditableFieldProps {
  value: unknown
  path: string
  fieldType?: EditableFieldType
  enumOptions?: Array<{ label: string; value: string }>
  booleanLabels?: { trueLabel: string; falseLabel: string }
  onSave: (path: string, value: unknown) => Promise<void>
  disabled?: boolean
  className?: string
  emptyText?: string
}

function valueToDraft(value: unknown, fieldType: EditableFieldType): string {
  if (fieldType === 'list') {
    if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')
    return ''
  }
  if (fieldType === 'boolean') {
    if (value === true) return 'true'
    if (value === false) return 'false'
    return ''
  }
  return String(value ?? '')
}

function parseDraftValue(draft: string, fieldType: EditableFieldType): unknown {
  if (fieldType === 'list') {
    return draft
      .split(/[,\n;]/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  if (fieldType === 'boolean') {
    const normalized = draft.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    return null
  }
  return draft.trim()
}

export function EditableField({
  value,
  path,
  fieldType = 'text',
  enumOptions = [],
  booleanLabels,
  onSave,
  disabled = false,
  className,
  emptyText = 'Pendiente',
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(valueToDraft(value, fieldType))
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)

  const baseDraft = useMemo(() => valueToDraft(value, fieldType), [value, fieldType])

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(baseDraft)
      setErrorMessage(null)
    }
  }, [baseDraft, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [isEditing])

  const displayValue = useMemo(() => {
    const raw = String(baseDraft || '').trim()
    if (fieldType === 'boolean') {
      if (raw === 'true') return booleanLabels?.trueLabel || 'Sí'
      if (raw === 'false') return booleanLabels?.falseLabel || 'No'
    }
    return raw
  }, [baseDraft, fieldType, booleanLabels])

  const handleCancel = () => {
    setDraftValue(baseDraft)
    setErrorMessage(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (disabled || isSaving) return
    const nextValue = parseDraftValue(draftValue, fieldType)
    const previous = parseDraftValue(baseDraft, fieldType)
    if (JSON.stringify(nextValue) === JSON.stringify(previous)) {
      setIsEditing(false)
      setErrorMessage(null)
      return
    }
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSave(path, nextValue)
      setIsEditing(false)
    } catch (error: any) {
      setErrorMessage(String(error?.message || 'No se pudo guardar el cambio.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
      return
    }
    if (event.key === 'Enter') {
      if (fieldType === 'textarea' && event.shiftKey) return
      event.preventDefault()
      void handleSave()
    }
  }

  if (!isEditing) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span className={cn(!displayValue && 'italic text-gray-400')}>
          {displayValue || emptyText}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="Editar campo"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-col gap-1 min-w-[180px]', className)}>
      {fieldType === 'textarea' ? (
        <textarea
          ref={(node) => {
            inputRef.current = node
          }}
          value={draftValue}
          rows={2}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void handleSave()}
          className="w-full rounded border border-blue-300 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={isSaving}
        />
      ) : fieldType === 'enum' ? (
        <select
          ref={(node) => {
            inputRef.current = node
          }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void handleSave()}
          className="w-full rounded border border-blue-300 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={isSaving}
        >
          <option value="">Selecciona...</option>
          {enumOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : fieldType === 'boolean' ? (
        <select
          ref={(node) => {
            inputRef.current = node
          }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void handleSave()}
          className="w-full rounded border border-blue-300 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={isSaving}
        >
          <option value="">Selecciona...</option>
          <option value="true">{booleanLabels?.trueLabel || 'Sí'}</option>
          <option value="false">{booleanLabels?.falseLabel || 'No'}</option>
        </select>
      ) : (
        <input
          ref={(node) => {
            inputRef.current = node
          }}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void handleSave()}
          className="w-full rounded border border-blue-300 px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={isSaving}
        />
      )}

      {isSaving && (
        <span className="inline-flex items-center gap-1 text-[10px] text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Guardando...
        </span>
      )}
      {errorMessage && <span className="text-[10px] text-red-600">{errorMessage}</span>}
    </span>
  )
}


