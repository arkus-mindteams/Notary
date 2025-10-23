"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Edit2, Save, X } from "lucide-react"

interface TextPanelProps {
  title: string
  text: string
  editable?: boolean
  onTextChange?: (text: string) => void
  onHighlight?: (region: string) => void
}

export function TextPanel({ title, text, editable = false, onTextChange, onHighlight }: TextPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedText, setEditedText] = useState(text)

  const handleSave = () => {
    if (onTextChange) {
      onTextChange(editedText)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedText(text)
    setIsEditing(false)
  }

  const renderTextWithHighlights = (content: string) => {
    const directions = ["NORTE", "SUR", "ESTE", "OESTE", "AL NORTE", "AL SUR", "AL ORIENTE", "AL PONIENTE"]
    const parts = content.split(/(\b(?:AL )?(?:NORTE|SUR|ESTE|ORIENTE|PONIENTE)\b)/gi)

    return parts.map((part, index) => {
      const isDirection = directions.some((dir) => part.toUpperCase().includes(dir))

      if (isDirection) {
        return (
          <span
            key={index}
            className="font-semibold text-primary cursor-pointer hover:bg-highlight/30 px-1 rounded transition-colors"
            onMouseEnter={() => onHighlight?.(part)}
            onMouseLeave={() => onHighlight?.(null as any)}
          >
            {part}
          </span>
        )
      }

      return <span key={index}>{part}</span>
    })
  }

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <span className="text-sm font-medium">{title}</span>
        {editable && (
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleSave}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isEditing ? (
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="min-h-[400px] font-mono text-sm resize-none"
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{renderTextWithHighlights(text)}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
