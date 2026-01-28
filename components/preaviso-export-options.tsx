"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2, Copy, CheckCircle2 } from 'lucide-react'
import { PreavisoTemplateRenderer } from '@/lib/preaviso-template-renderer'
import type { PreavisoSimplifiedJSON } from '@/lib/types/preaviso-simplified'
import type { PreavisoData } from './preaviso-chat'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface PreavisoExportOptionsProps {
  data: PreavisoData
  onExportComplete?: () => void
  onViewFullDocument?: () => void
}

export function PreavisoExportOptions({ data, onExportComplete, onViewFullDocument }: PreavisoExportOptionsProps) {
  const [isGeneratingWord, setIsGeneratingWord] = useState(false)
  const [isGeneratingText, setIsGeneratingText] = useState(false)
  const [showTextModal, setShowTextModal] = useState(false)
  const [completeText, setCompleteText] = useState<string>("")
  const [copied, setCopied] = useState(false)

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

  const handleOpenTextModal = async () => {
    setShowTextModal(true)
    setIsGeneratingText(true)
    setCompleteText("")

    try {
      const text = await PreavisoTemplateRenderer.renderToText(simplifiedData)
      setCompleteText(text || "No hay texto disponible.")
    } catch (error) {
      console.error('Error generando texto:', error)
      setCompleteText("Error al generar el texto. Por favor, intenta de nuevo.")
    } finally {
      setIsGeneratingText(false)
    }
  }

  const handleCopyText = async () => {
    if (completeText) {
      try {
        await navigator.clipboard.writeText(completeText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        console.error('Error copiando texto:', error)
        alert('Error al copiar el texto. Por favor, intenta de nuevo.')
      }
    }
  }

  const handleDownloadText = () => {
    if (completeText) {
      const blob = new Blob([completeText], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const filename = PreavisoTemplateRenderer.generateFileName(simplifiedData, 'txt')
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2 justify-end">
          <Button
            onClick={handleOpenTextModal}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 px-3"
            disabled={isGeneratingText || isGeneratingWord}
          >
            {isGeneratingText ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span className="text-xs sm:text-sm">Ver Texto</span>
          </Button>
          <Button
            onClick={handleDownloadWord}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 px-3"
            disabled={isGeneratingWord || isGeneratingText}
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

      {/* Modal para ver texto completo */}
      <Dialog open={showTextModal} onOpenChange={setShowTextModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Texto del Pre-Aviso</DialogTitle>
            <DialogDescription>
              Revisa el texto completo del pre-aviso. Puedes copiarlo o descargarlo como archivo TXT.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            {isGeneratingText ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-600">Generando texto...</span>
              </div>
            ) : (
              <>
                <Textarea
                  value={completeText}
                  onChange={(e) => setCompleteText(e.target.value)}
                  className="flex-1 min-h-[400px] font-mono text-sm resize-none"
                  readOnly={false}
                />
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyText}
                    disabled={!completeText || isGeneratingText}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar
                      </>
                    )}
                  </Button>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTextModal(false)}
                    >
                      Cerrar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDownloadText}
                      disabled={!completeText || isGeneratingText}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Descargar TXT
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

