"use client"

import { useState, useEffect } from 'react'
import {
    X,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Bot,
    FileCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
    Dialog,
    DialogContent,
    DialogTitle
} from '@/components/ui/dialog'
import {
    ChatMessage,
    UploadedDocument
} from '@/lib/tramites/shared/types/preaviso-types'

interface ImageThumbnailProps {
    file: File
    isProcessing?: boolean
    isProcessed?: boolean
    hasError?: boolean
    isCancelled?: boolean
}

function ImageThumbnail({ file, isProcessing = false, isProcessed = false, hasError = false, isCancelled = false }: ImageThumbnailProps) {
    const [fileUrl, setFileUrl] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    useEffect(() => {
        const url = URL.createObjectURL(file)
        setFileUrl(url)

        return () => {
            if (url) URL.revokeObjectURL(url)
        }
    }, [file])

    if (!fileUrl) return null

    return (
        <>
            <div className="relative group">
                <img
                    src={fileUrl}
                    alt={file.name}
                    className="h-20 w-20 object-cover rounded-lg border-2 border-gray-200 hover:border-blue-400 transition-all cursor-pointer shadow-sm"
                    onClick={() => setIsDialogOpen(true)}
                />
                {isProcessed ? (
                    isCancelled ? (
                        <div className="absolute top-1.5 right-1.5 bg-orange-500 rounded-full p-1 shadow-lg">
                            <X className="h-2.5 w-2.5 text-white" />
                        </div>
                    ) : hasError ? (
                        <div className="absolute top-1.5 right-1.5 bg-red-500 rounded-full p-1 shadow-lg">
                            <AlertCircle className="h-2.5 w-2.5 text-white" />
                        </div>
                    ) : (
                        <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-1 shadow-lg">
                            <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                        </div>
                    )
                ) : isProcessing ? (
                    <div className="absolute top-1.5 right-1.5 bg-blue-500 rounded-full p-1 shadow-lg">
                        <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                    </div>
                ) : null}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity truncate">
                    {file.name}
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-transparent border-none">
                    <DialogTitle className="sr-only">Vista previa de imagen: {file.name}</DialogTitle>
                    <div className="relative w-full h-full flex items-center justify-center bg-black/90 rounded-lg">
                        <img
                            src={fileUrl}
                            alt={file.name}
                            className="max-w-full max-h-[95vh] object-contain"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                            onClick={() => setIsDialogOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white text-sm px-3 py-2 rounded-lg">
                            {file.name}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

interface ChatMessageItemProps {
    message: ChatMessage
    isProcessingDocument: boolean
    processingFileName: string | null
    processingProgress: number
    uploadedDocuments: UploadedDocument[]
}

export function ChatMessageItem({
    message,
    isProcessingDocument,
    processingFileName,
    processingProgress,
    uploadedDocuments
}: ChatMessageItemProps) {
    return (
        <div
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
        >
            <div
                className={`flex items-end space-x-2 max-w-[60ch] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
            >
                {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-300 flex items-center justify-center flex-shrink-0 shadow-sm mb-1 ring-1 ring-white/20">
                        <Bot className="w-5 h-5 text-black bg-gray-200" />
                    </div>
                )}

                <div
                    className={`rounded-2xl px-4 py-2.5 max-w-full ${message.role === 'user'
                        ? 'bg-gray-800 text-white shadow-lg'
                        : 'bg-white text-gray-900 shadow-sm border border-gray-100'
                        }`}
                >
                    {!(message.role === 'assistant' && message.content === 'Procesando documento...') && (
                        <p className={`text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap ${message.role === 'user' ? 'text-white' : 'text-gray-800'
                            }`}>{message.content}</p>
                    )}

                    {message.role === 'assistant' &&
                        message.content === 'Procesando documento...' &&
                        isProcessingDocument && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 font-medium flex items-center space-x-2">
                                        <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                        <span>{processingFileName ? `Procesando: ${processingFileName}` : 'Procesando documento...'}</span>
                                    </span>
                                    <span className="text-blue-600 font-semibold pl-6">{Math.round(processingProgress)}%</span>
                                </div>
                                <Progress value={processingProgress} className="h-1.5 bg-blue-100" />
                            </div>
                        )}

                    {message.attachments && message.attachments.length > 0 && (
                        <div className={`mt-3 pt-3 ${message.role === 'user' ? 'border-t border-white/20' : 'border-t border-gray-100'
                            }`}>
                            <div className="flex flex-wrap gap-2">
                                {message.attachments.map((file, idx) => {
                                    const isImage = file.type.startsWith('image/')
                                    const correspondingDoc = uploadedDocuments.find(doc => doc.name === file.name)
                                    const isProcessing = correspondingDoc ? !correspondingDoc.processed : false
                                    const isProcessed = correspondingDoc?.processed || false
                                    const hasError = correspondingDoc?.error ? true : false
                                    const isCancelled = correspondingDoc?.cancelled || false

                                    return (
                                        <div key={idx}>
                                            {isImage ? (
                                                <ImageThumbnail
                                                    file={file}
                                                    isProcessing={isProcessing}
                                                    isProcessed={isProcessed}
                                                    hasError={hasError}
                                                    isCancelled={isCancelled}
                                                />
                                            ) : (
                                                <div className={`flex items-center space-x-2 text-xs ${message.role === 'user' ? 'text-gray-200' : 'text-gray-600'
                                                    }`}>
                                                    <FileCheck className="h-3.5 w-3.5" />
                                                    <span className="truncate">{file.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <p className={`text-[10px] mt-1.5 ${message.role === 'user' ? 'text-gray-300' : 'text-gray-400'
                        }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>
        </div>
    )
}
