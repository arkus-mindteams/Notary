"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Check, X, Edit2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

interface EditableSegmentProps {
  text: string
  isHighlighted: boolean
  onHover: () => void
  onLeave: () => void
  onChange: (newText: string) => void
  isEditMode: boolean
}

export function EditableSegment({ text, isHighlighted, onHover, onLeave, onChange, isEditMode }: EditableSegmentProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    if (!isEditMode) return
    setEditedText(text)
    setIsEditing(true)
  }

  const handleSave = () => {
    onChange(editedText)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedText(text)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel()
    } else if (e.key === "Enter" && e.ctrlKey) {
      handleSave()
    }
  }

  if (isEditing) {
    return (
      <div className="p-3 rounded-lg border-2 border-primary bg-card shadow-lg">
        <Textarea
          ref={textareaRef}
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] text-sm resize-none mb-2"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            <X className="h-3 w-3 mr-1" />
            Cancelar
          </Button>
          <Button variant="default" size="sm" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />
            Guardar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Presiona <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+Enter</kbd> para guardar o{" "}
          <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd> para cancelar
        </p>
      </div>
    )
  }

  return (
    <div
      className={`group relative p-3 rounded-lg border transition-all duration-200 ${
        isHighlighted
          ? "bg-highlight/30 border-warning shadow-md scale-[1.02]"
          : "bg-card hover:bg-muted/50 border-border"
      } ${isEditMode ? "cursor-pointer hover:border-primary/50" : ""}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={handleStartEdit}
    >
      <p className="text-sm leading-relaxed pr-8">{text}</p>
      {isEditMode && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation()
            handleStartEdit()
          }}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
