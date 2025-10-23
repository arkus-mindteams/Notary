"use client"

import { useCallback } from 'react'

export function useFileUpload() {
  const createFileInput = useCallback((onFileSelect: (file: File) => void) => {
    if (typeof window === 'undefined') return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.docx'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        onFileSelect(file)
      }
    }
    input.click()
  }, [])

  return { createFileInput }
}



