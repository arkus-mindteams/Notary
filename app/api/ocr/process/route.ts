import { NextRequest, NextResponse } from 'next/server'
import { enhancedOCRService } from '@/lib/enhanced-ocr-service'

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    console.log('📄 Processing file:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB', 'Type:', file.type)
    
    // Process the document using the enhanced OCR service
    const result = await enhancedOCRService.processDocument(file)
    
    const totalTime = Date.now() - startTime;
    console.log('✅ OCR Processing completed:', {
      success: result.success,
      method: result.method,
      processingTime: totalTime / 1000 + 's',
      confidence: result.confidence,
      needsCorrection: result.needsCorrection,
      hasRawText: !!result.rawText,
      rawTextLength: result.rawText?.length
    })

    return NextResponse.json(result)
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('❌ OCR Processing error after', totalTime + 'ms:', error)
    return NextResponse.json(
      { 
        error: 'OCR processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTime: totalTime
      },
      { status: 500 }
    )
  }
}
