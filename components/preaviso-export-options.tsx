"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2 } from 'lucide-react'
import { PreavisoTemplateRenderer } from '@/lib/preaviso-template-renderer'
import type { PreavisoSimplifiedJSON } from '@/lib/types/preaviso-simplified'
import type { PreavisoData } from './preaviso-chat'

interface PreavisoExportOptionsProps {
  data: PreavisoData
  onExportComplete?: () => void
  onViewFullDocument?: () => void
  /** Botones que se muestran a la izquierda en la misma fila que "Descargar Word" (p. ej. Historial) */
  leadingButtons?: React.ReactNode
}

export function PreavisoExportOptions({ data, onExportComplete, onViewFullDocument, leadingButtons }: PreavisoExportOptionsProps) {
  const [isGeneratingWord, setIsGeneratingWord] = useState(false)

  const simplifiedData: PreavisoSimplifiedJSON = PreavisoTemplateRenderer.convertFromPreavisoData(data)

  const handleDownloadWord = async () => {
    setIsGeneratingWord(true)
    try {
      const url = await PreavisoTemplateRenderer.renderToWord(simplifiedData)
      const filename = PreavisoTemplateRenderer.generateFileName(simplifiedData, 'docx')
      
      // Crear y hacer clic en el enlace de descarga
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Limpiar URL después de un tiempo
      setTimeout(() => URL.revokeObjectURL(url), 100)

      if (onExportComplete) {
        onExportComplete()
      }
    } catch (error) {
      console.error('Error generando Word:', error)
      alert('Error al generar el documento en Word. Por favor, intenta de nuevo.')
    } finally {
      setIsGeneratingWord(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center justify-end flex-wrap">
          {leadingButtons}
          <Button
            onClick={handleDownloadWord}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 px-3"
            disabled={isGeneratingWord}
          >
            {isGeneratingWord ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="text-xs sm:text-sm">Descargar Word</span>
          </Button>
        </div>
        {onViewFullDocument && (
          <div className="flex justify-end">
            <Button
              onClick={onViewFullDocument}
              size="sm"
              className="gap-1.5 h-8 px-3 bg-blue-600 hover:bg-blue-700"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs sm:text-sm">Ver Documento Completo</span>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

