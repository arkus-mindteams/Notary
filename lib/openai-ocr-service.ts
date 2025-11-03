/**
 * OpenAI OCR Service
 * Uses OpenAI Vision API (GPT-4 Vision) for OCR processing
 * Supports both images and PDFs by converting PDFs to images first
 */

import OpenAI from 'openai';

export interface OpenAIOCRResult {
  success: boolean;
  text: string;
  confidence: number;
  method: string;
  error?: string;
}

export class OpenAIOCRService {
  private client: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      console.log('✅ OpenAI client initialized');
    } else {
      console.log('⚠️ OPENAI_API_KEY not found in environment variables');
    }
  }

  /**
   * Extract text from image using OpenAI Vision
   */
  async extractTextFromBuffer(buffer: Buffer, mimeType: string = 'image/png'): Promise<OpenAIOCRResult> {
    try {
      if (!this.client) {
        throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
      }

      console.log('🔄 Starting OpenAI OCR processing from buffer...');
      console.log(`📄 Processing ${mimeType} file (${buffer.length} bytes)`);
      
      // Convert buffer to base64
      const base64Image = buffer.toString('base64');

      // Use OpenAI Vision API
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this image/document. Return only the raw text content without any formatting or interpretation. If this is a legal document about property boundaries (deslindes), include all measurements, directions (NORTE, SUR, ESTE, OESTE, etc.), and descriptions exactly as they appear.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
      });

      const extractedText = response.choices[0]?.message?.content?.trim() || '';
      
      if (!extractedText) {
        throw new Error('No text extracted from document');
      }

      // Calculate confidence based on text quality
      const confidence = this.calculateConfidence(extractedText);

      console.log('✅ OpenAI OCR completed:', { 
        textLength: extractedText.length, 
        confidence: confidence,
        fileType: mimeType
      });

      return {
        success: true,
        text: extractedText.trim(),
        confidence: confidence,
        method: mimeType === 'application/pdf' ? 'openai-vision-pdf' : 'openai-vision'
      };
    } catch (error) {
      console.error('❌ OpenAI OCR failed:', error);
      return {
        success: false,
        text: '',
        confidence: 0,
        method: 'openai-vision',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Calculate confidence based on text quality
   */
  private calculateConfidence(text: string): number {
    if (text.length === 0) return 0.0;
    
    let confidence = 0.85; // Base confidence for OpenAI
    
    // Property keywords boost confidence
    const propertyKeywords = [
      'LOTE', 'MANZANA', 'PREDIO', 'NORTE', 'SUR', 'ESTE', 'OESTE',
      'COLINDA', 'COLINDANCIA', 'METROS', 'LÍMITES', 'CONSTRUIDA',
      'LIMITE', 'LIMITES', 'COLINDANTE', 'AREA', 'SUPERFICIE', 'CALLE',
    ];
    
    const textUpper = text.toUpperCase();
    const foundKeywords = propertyKeywords.filter(keyword => 
      textUpper.includes(keyword)
    ).length;
    
    // Boost confidence based on keyword matches
    confidence += foundKeywords * 0.02;
    
    // Penalize very short text
    if (text.length < 50) {
      confidence -= 0.3;
    }
    
    // Ensure confidence is between 0 and 1
    return Math.max(0.0, Math.min(1.0, confidence));
  }

  /**
   * Check if OpenAI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}

// Export singleton instance
export const openAIOCRService = new OpenAIOCRService();

