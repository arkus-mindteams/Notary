/**
 * Mistral AI OCR Service
 * Uses Mistral AI OCR API for text extraction
 * Supports both images and PDFs
 */

import { Mistral } from '@mistralai/mistralai';

export interface MistralOCRResult {
  success: boolean;
  text: string;
  confidence: number;
  method: 'mistral-vision' | 'mistral-vision-pdf';
  error?: string;
}

export class MistralOCRService {
  private client: Mistral | null = null;

  constructor() {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (apiKey) {
      this.client = new Mistral({ apiKey });
      console.log('✅ Mistral client initialized');
    } else {
      console.log('⚠️ MISTRAL_API_KEY not found in environment variables');
    }
  }

  /**
   * Extract text from image/PDF using Mistral AI OCR
   */
  async extractTextFromBuffer(buffer: Buffer, mimeType: string = 'image/png'): Promise<MistralOCRResult> {
    try {
      if (!this.client) {
        throw new Error('Mistral client not initialized. Please set MISTRAL_API_KEY environment variable.');
      }

      console.log('🔄 Starting Mistral AI OCR processing from buffer...');
      console.log(`📄 Processing ${mimeType} file (${buffer.length} bytes)`);
      
      // Determine if it's a PDF or image
      const isPDF = mimeType === 'application/pdf';
      const isImage = mimeType.startsWith('image/');

      if (!isImage && !isPDF) {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      // Determine file extension
      const ext = mimeType === 'application/pdf' ? 'pdf' : 
                  mimeType === 'image/png' ? 'png' :
                  mimeType === 'image/jpeg' ? 'jpg' :
                  mimeType === 'image/jpg' ? 'jpg' :
                  'dat';
      const fileName = `document.${ext}`;

      // Upload file first (more efficient than base64)
      console.log('📤 Uploading file to Mistral AI...');
      const uploadStart = Date.now();
      const uploadedFile = await this.client.files.upload({
        file: {
          fileName: fileName,
          content: buffer
        },
        purpose: 'ocr'
      });
      console.log(`✅ File uploaded in ${Date.now() - uploadStart}ms (ID: ${uploadedFile.id})`);

      // Use Mistral AI OCR API with file ID
      const ocrStart = Date.now();
      const response = await this.client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          fileId: uploadedFile.id,
          type: 'file'
        }
      });
      console.log(`✅ OCR completed in ${Date.now() - ocrStart}ms`);

      // Extract text from response pages
      const extractedText = response.pages
        .map(page => page.markdown)
        .join('\n\n');
      
      if (!extractedText) {
        // Clean up uploaded file even if OCR failed
        try {
          await this.client.files.delete({ fileId: uploadedFile.id });
        } catch (delError) {
          console.error('Failed to delete uploaded file:', delError);
        }
        throw new Error('No text extracted from document');
      }

      // Calculate confidence based on text quality
      const confidence = this.calculateConfidence(extractedText);

      console.log('✅ Mistral AI OCR completed:', { 
        textLength: extractedText.length, 
        confidence: confidence,
        fileType: mimeType
      });

      // Clean up uploaded file after successful processing
      try {
        await this.client.files.delete({ fileId: uploadedFile.id });
        console.log('✅ Uploaded file cleaned up');
      } catch (delError) {
        console.error('⚠️  Failed to delete uploaded file:', delError);
      }

      return {
        success: true,
        text: extractedText.trim(),
        confidence: confidence,
        method: isPDF ? 'mistral-vision-pdf' : 'mistral-vision'
      };
    } catch (error) {
      console.error('❌ Mistral AI OCR failed:', error);
      return {
        success: false,
        text: '',
        confidence: 0,
        method: 'mistral-vision',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Calculate confidence based on text quality
   */
  private calculateConfidence(text: string): number {
    if (text.length === 0) return 0.0;
    
    let confidence = 0.85; // Base confidence for Mistral
    
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
   * Check if Mistral AI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}

// Export singleton instance
export const mistralOCRService = new MistralOCRService();

