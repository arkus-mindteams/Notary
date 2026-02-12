"use client"

import { useEffect, useRef, useState } from "react"
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, List, Redo2, Underline, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WordLikeEditorProps {
  initialHtml: string
  onChange: (html: string, plainText: string) => void
}

function sanitizeEditableHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
}

export function WordLikeEditor({ initialHtml, onChange }: WordLikeEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [loadedHtml, setLoadedHtml] = useState("")

  useEffect(() => {
    if (!editorRef.current) {
      return
    }
    if (initialHtml === loadedHtml) {
      return
    }

    editorRef.current.innerHTML = sanitizeEditableHtml(initialHtml || "<p></p>")
    setLoadedHtml(initialHtml)
  }, [initialHtml, loadedHtml])

  const emitChange = () => {
    if (!editorRef.current) {
      return
    }
    const html = sanitizeEditableHtml(editorRef.current.innerHTML)
    const plainText = (editorRef.current.innerText || editorRef.current.textContent || "").trim()
    onChange(html, plainText)
  }

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    emitChange()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 border rounded-md bg-muted/30 p-2">
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("bold")}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("italic")}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("underline")}>
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("justifyLeft")}>
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("justifyCenter")}>
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("justifyRight")}>
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("undo")}>
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => runCommand("redo")}>
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-auto rounded-md border bg-muted/10 p-4">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="mx-auto min-h-[900px] w-full max-w-[816px] bg-white p-[72px] text-[14pt] leading-relaxed shadow-sm outline-none"
          style={{ fontFamily: '"Times New Roman", serif' }}
          onInput={emitChange}
          onBlur={emitChange}
        />
      </div>
    </div>
  )
}
