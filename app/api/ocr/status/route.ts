import { NextResponse } from 'next/server'
import { enhancedOCRService } from '@/lib/enhanced-ocr-service'

export async function GET() {
  try {
    const status = enhancedOCRService.getServiceStatus()
    
    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error getting OCR status:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get OCR status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
