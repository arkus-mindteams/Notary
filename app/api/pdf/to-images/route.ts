import { NextRequest, NextResponse } from 'next/server'

/**
 * API Route para convertir PDFs a imágenes
 * 
 * NOTA: La conversión de PDFs a imágenes se hace en el cliente usando pdfjs-dist
 * porque Next.js serverless (Vercel) no soporta fácilmente canvas nativo.
 * 
 * La función convertPdfToImages en lib/ocr-client.ts ya maneja esto correctamente
 * usando el DOM canvas del navegador, que es más compatible y no requiere
 * dependencias nativas.
 * 
 * Este endpoint está aquí por compatibilidad pero la conversión real ocurre en el cliente.
 */
export async function POST(request: NextRequest) {
  // Esta ruta está implementada pero la conversión real se hace en el cliente
  // Ver lib/ocr-client.ts -> convertPdfToImages()
  return NextResponse.json(
    {
      error: 'La conversión de PDFs se realiza en el cliente por compatibilidad con Next.js serverless',
      message: 'Use la función convertPdfToImages de lib/ocr-client.ts que ya está implementada',
    },
    { status: 501 }
  )
}

