"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UploadZone } from "@/components/upload-zone"
import { DocumentViewer } from "@/components/document-viewer"
import { FileText, ImageIcon, X, CheckCircle2, AlertCircle } from "lucide-react"
import { detectFileType } from "@/lib/file-type-detector"

export default function TestViewerPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = useCallback((file: File) => {
    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      setError(`File size too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    // Validate file type - detectFileType expects (fileUrl, fileName)
    const fileTypeInfo = detectFileType("", file.name)
    if (!fileTypeInfo.isSupported) {
      setError(`File type not supported: ${fileTypeInfo.extension}. Supported types: PDF, DOCX, PNG, JPG, JPEG, GIF, WEBP`)
      return
    }

    // Clear previous errors
    setError(null)

    // Clean up previous URL if exists
    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }

    // Create object URL for the file
    const url = URL.createObjectURL(file)
    setSelectedFile(file)
    setDocumentUrl(url)
  }, [documentUrl])

  const handleClear = useCallback(() => {
    if (documentUrl && !documentUrl.startsWith("/")) {
      URL.revokeObjectURL(documentUrl)
    }
    setSelectedFile(null)
    setDocumentUrl("")
    setError(null)
  }, [documentUrl])

  const fileTypeInfo = selectedFile ? detectFileType(documentUrl || "", selectedFile.name) : null

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">PDF & Image Viewer Test</h1>
          <p className="text-muted-foreground">
            Upload a PDF or image file to test the document viewer functionality
          </p>
        </div>

        {/* File Info Card */}
        {selectedFile && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {fileTypeInfo?.type === 'pdf' ? (
                  <FileText className="h-5 w-5 text-red-600" />
                ) : fileTypeInfo?.type === 'image' ? (
                  <ImageIcon className="h-5 w-5 text-blue-600" />
                ) : (
                  <FileText className="h-5 w-5 text-gray-600" />
                )}
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {fileTypeInfo?.extension.toUpperCase() || 'Unknown'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleClear}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </Card>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Upload Zone - Show when no file is selected */}
        {!selectedFile && (
          <Card className="p-8">
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Upload a File</h2>
                <p className="text-sm text-muted-foreground">
                  Supported formats: PDF, DOCX, PNG, JPG, JPEG, GIF, WEBP
                </p>
              </div>
              <UploadZone onFileSelect={handleFileSelect} />
            </div>
          </Card>
        )}

        {/* Document Viewer - Show when file is selected */}
        {selectedFile && documentUrl && !error && (
          <Card className="overflow-hidden">
            <div className="h-[800px] md:h-[900px]">
              <DocumentViewer
                documentUrl={documentUrl}
                fileName={selectedFile.name}
              />
            </div>
          </Card>
        )}

        {/* Instructions */}
        <Card className="p-6 bg-muted/50">
          <h3 className="font-semibold mb-3">Test Instructions</h3>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>Upload a PDF file to test the PDF viewer with zoom, download, and navigation controls</li>
            <li>Upload an image file (PNG, JPG, etc.) to test image viewing with zoom and rotation</li>
            <li>Try drag and drop or click to select a file</li>
            <li>Maximum file size: 50MB</li>
            <li>Use the viewer controls to zoom, rotate, and navigate the document</li>
          </ul>
        </Card>

        {/* Features List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">PDF Viewer</h4>
                <p className="text-sm text-muted-foreground">
                  Full-featured PDF viewer with zoom, navigation, download, and rotation
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Image Viewer</h4>
                <p className="text-sm text-muted-foreground">
                  Image viewing with zoom and rotation controls for common formats
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">File Upload</h4>
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to upload, with file validation
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

