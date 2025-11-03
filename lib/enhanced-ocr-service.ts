import { openAIDocumentProcessor } from './openai-document-processor';
import { openAIOCRService } from './openai-ocr-service';
import { mistralOCRService } from './mistral-ocr-service';
import { MOCK_EXTRACTED_TEXT } from './constants';

export interface BoundarySegment {
  id: string
  measurement: string
  unit: string
  notarialText: string
  regionId: string
}

export interface PropertyUnit {
  id: string
  name: string
  surface: string
  notarialText?: string  // Unit-level aggregated notarial text
  boundaries: {
    norte: BoundarySegment[]
    sur: BoundarySegment[]
    este: BoundarySegment[]
    oeste: BoundarySegment[]
    noreste?: BoundarySegment[]
    noroeste?: BoundarySegment[]
    sureste?: BoundarySegment[]
    suroeste?: BoundarySegment[]
  }
}

export interface OCRResult {
  success: boolean
  extractedData: {
    units: PropertyUnit[]
  }
  confidence: number
  processingTime: number
  method: 'mistral-vision' | 'mistral-vision-pdf' | 'openai-vision' | 'openai-vision-pdf' | 'gpt-4' | 'error'
  extractedText: string
  error?: string
  details?: string
  needsCorrection?: boolean  // Indicates if manual correction is needed
  rawText?: string          // Unprocessed text from OCR
}

export class EnhancedOCRService {  
  private debugMode: boolean;

  constructor() {
    // Check if OpenAI and Mistral are available
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasMistralKey = !!process.env.MISTRAL_API_KEY;
    
    // Debug mode to test OCR extraction without AI processing
    this.debugMode = process.env.OCR_DEBUG_MODE === 'true';
    
    console.log('EnhancedOCRService initialized:', {
      hasOpenAIKey,
      hasMistralKey,
      openAIAvailable: openAIOCRService.isAvailable(),
      mistralAvailable: mistralOCRService.isAvailable(),
      debugMode: this.debugMode,
      envVars: {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        MISTRAL_API_KEY: !!hasMistralKey,
        OCR_DEBUG_MODE: this.debugMode
      }
    });
  }

  /**
   * Main OCR processing function
   */
  async processDocument(file: File): Promise<OCRResult> {
    const startTime = Date.now();

    console.log('processDocument called:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    try {     
        console.log('Attempting to use real services...');     
        const result = await this.processWithRealServices(file, startTime);
        console.log('Real services processing completed successfully:', { method: result.method });
        return result;     
    } catch (error) {
      console.error('OCR Processing Error:', error);
      console.log('Real services failed:', error instanceof Error ? error.message : 'Unknown error');
      
      // Return error instead of falling back to simulation
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        error: 'Document processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        extractedData: { units: [] },
        confidence: 0.0,
        processingTime,
        method: 'error',
        extractedText: ''
      };
    }
  }

  /**
   * Process document using real Mistral OCR and OpenAI GPT-4 services
   */
  private async processWithRealServices(file: File, startTime: number): Promise<OCRResult> {    
    console.log('File details:', { name: file.name, type: file.type, size: file.size });
    
    try {
      // Step 1: Extract text using Mistral AI
      const ocrResult = await this.extractTextWithMistral(file);
      
      // Step 2: Clean and analyze extracted text
      const cleanedText = this.cleanAndAnalyzeExtractedText(ocrResult.text);
      
      // Step 3: Process with OpenAI GPT-4
      const openaiResult = await openAIDocumentProcessor.processDocumentText(cleanedText);
      
      // Step 4: Convert to expected format
      const units = this.convertOpenAIUnitsToFormat(openaiResult.extractedUnits);
      
      return {
        success: true,
        extractedData: { units },
        confidence: openaiResult.confidence,
        processingTime: Date.now() - startTime,
        method: ocrResult.method,
        extractedText: cleanedText,
        needsCorrection: false,
        rawText: cleanedText
      };
    } catch (error) {
      console.error('Error in processWithRealServices:', error);
      throw error;
    }
  }

  /**
   * Extract text from file using Mistral AI OCR
   */
  private async extractTextWithMistral(file: File): Promise<{ text: string; method: 'mistral-vision' | 'mistral-vision-pdf' }> {
    const fileType = file.type;
    
    if (!fileType.startsWith('image/') && fileType !== 'application/pdf') {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
    
    console.log('Using Mistral AI Vision for OCR extraction...');
    
    try {
      const fileBuffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(fileBuffer);
      
      const ocrResult = await mistralOCRService.extractTextFromBuffer(imageBuffer, fileType);
      
      console.log('🔍 Raw OCR Result from Mistral:', {
        success: ocrResult.success,
        text: ocrResult.text ? 'exists' : 'null/undefined',
        textLength: ocrResult.text?.length || 0,
        confidence: ocrResult.confidence,
        method: ocrResult.method,
        error: ocrResult.error
      });
      
      if (ocrResult.success) {
        console.log('✅ Mistral AI Vision OCR completed:', { 
          textLength: ocrResult.text.length, 
          confidence: ocrResult.confidence, 
          method: ocrResult.method
        });
        return { text: ocrResult.text, method: ocrResult.method };
      } else {
        throw new Error(`Mistral AI Vision failed: ${ocrResult.error}`);
      }
    } catch (ocrError: unknown) {
      console.error('❌ Mistral AI Vision failed:', ocrError);
      const errorMsg = ocrError instanceof Error ? ocrError.message : String(ocrError);
      throw new Error(`Document processing failed: Mistral AI Vision cannot process this ${fileType} format. Please try converting to PNG/JPG format. Error details: ${errorMsg}`);
    }
  }

  /**
   * Clean and analyze extracted text
   */
  private cleanAndAnalyzeExtractedText(text: string): string {
    const cleanedText = this.cleanDuplicatedText(text);
    
    console.log('========== OCR EXTRACTION ANALYSIS ==========');
    console.log('Original text length:', text.length);
    console.log('Cleaned text length:', cleanedText.length);
    console.log('Cleaned text preview:', cleanedText.substring(0, Math.min(500, cleanedText.length)));
    
    this.analyzeDirectionalWords(cleanedText);
    this.detectMisreadings(cleanedText);
    
    console.log('=============================================\n');
    
    return cleanedText;
  }

  /**
   * Analyze directional words in text
   */
  private analyzeDirectionalWords(text: string): void {
    const hasNorte = text.includes('NORTE');
    const hasSur = text.includes('SUR');
    const hasEste = text.includes('ESTE');
    const hasOeste = text.includes('OESTE');
    
    console.log('Directional words detected:');
    console.log('  - NORTE:', hasNorte ? '✅ YES' : '❌ NO');
    console.log('  - SUR:', hasSur ? '✅ YES' : '❌ NO');
    console.log('  - ESTE:', hasEste ? '✅ YES' : '❌ NO');
    console.log('  - OESTE:', hasOeste ? '✅ YES' : '❌ NO');
  }

  /**
   * Detect common OCR misreadings
   */
  private detectMisreadings(text: string): void {
    const misreadings: string[] = [];
    
    if (text.includes('OEST') || text.includes('OESJ') || text.includes('0ESTE')) {
      misreadings.push('Found OESTE misreadings');
    }
    if (text.includes('N0RTE') || text.includes('NORT')) {
      misreadings.push('Found NORTE misreadings');
    }
    if (text.includes('S1IR') || text.includes('5UR')) {
      misreadings.push('Found SUR misreadings');
    }
    if (text.includes('ESJ') || text.includes('ESIE')) {
      misreadings.push('Found ESTE misreadings');
    }
    
    if (misreadings.length > 0) {
      console.log('⚠️  Misreadings detected:', misreadings.join(', '));
    }
  }

  /**
   * Convert OpenAI extracted units to expected format
   */
  private convertOpenAIUnitsToFormat(units: any[]): PropertyUnit[] {
    console.log('🔄 Converting to expected format...');
    
    return units.map(unit => {
      const mapBoundaries = (boundaries: any[] | undefined | null, direction: string) => {
        if (!boundaries || !Array.isArray(boundaries) || boundaries.length === 0) {
          console.log(`⚠️  ${unit.id} has no ${direction} boundaries`);
          return [];
        }
        return boundaries
          .filter(segment => segment && segment.measurement && segment.unit && segment.notarialText)
          .map(segment => ({
            id: `${unit.id}-${direction}-${segment.regionId}`,
            measurement: segment.measurement || '0',
            unit: segment.unit || 'MTS',
            notarialText: segment.notarialText || '',
            regionId: segment.regionId || `${unit.id}-${direction}-${Date.now()}`
          }));
      };

      return {
        id: unit.id,
        name: unit.name || `Unidad ${unit.id}`,
        surface: unit.surface || '0',
        boundaries: {
          norte: mapBoundaries(unit.boundaries.norte, 'norte'),
          sur: mapBoundaries(unit.boundaries.sur, 'sur'),
          este: mapBoundaries(unit.boundaries.este, 'este'),
          oeste: mapBoundaries(unit.boundaries.oeste, 'oeste'),
          noreste: mapBoundaries(unit.boundaries.noreste, 'noreste'),
          noroeste: mapBoundaries(unit.boundaries.noroeste, 'noroeste'),
          sureste: mapBoundaries(unit.boundaries.sureste, 'sureste'),
          suroeste: mapBoundaries(unit.boundaries.suroeste, 'suroeste')
        }
      };
    });
  }

  /**
   * Clean up duplicated text from OCR extraction
   */
  private cleanDuplicatedText(text: string): string {
    console.log('🧹 Starting text cleaning process...');
    
    // Split into lines and remove empty lines
    let lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const originalLineCount = lines.length;
    
    console.log(`📄 Original lines: ${originalLineCount}`);
    
    // Remove consecutive duplicate lines
    const uniqueLines: string[] = [];
    let lastLine = '';
    
    for (const line of lines) {
      // Skip if it's the same as the previous line
      if (line !== lastLine) {
        uniqueLines.push(line);
        lastLine = line;
      } else {
        console.log(`🔄 Removed duplicate line: "${line}"`);
      }
    }
    
    console.log(`📄 After removing consecutive duplicates: ${uniqueLines.length} lines`);
    
    // Remove lines that appear more than 3 times in the entire text
    const lineCounts = new Map<string, number>();
    for (const line of uniqueLines) {
      lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
    }
    
    const finalLines = uniqueLines.filter(line => {
      const count = lineCounts.get(line) || 0;
      if (count > 3) {
        console.log(`🔄 Removed frequently repeated line (${count} times): "${line}"`);
        return false;
      }
      return true;
    });
    
    console.log(`📄 After removing frequently repeated lines: ${finalLines.length} lines`);
    
    // Remove very short lines that are likely OCR artifacts (unless they're important)
    const importantShortLines = ['NORTE', 'SUR', 'ESTE', 'OESTE', 'LOTE', 'MANZANA'];
    const cleanedLines = finalLines.filter(line => {
      if (line.length < 3 && !importantShortLines.includes(line.toUpperCase())) {
        console.log(`🔄 Removed short artifact line: "${line}"`);
        return false;
      }
      return true;
    });
    
    console.log(`📄 After removing short artifacts: ${cleanedLines.length} lines`);
    
    // Join lines back together
    const cleanedText = cleanedLines.join('\n');
    
    console.log(`🧹 Text cleaning completed: ${originalLineCount} → ${cleanedLines.length} lines (${((originalLineCount - cleanedLines.length) / originalLineCount * 100).toFixed(1)}% reduction)`);
    
    return cleanedText;
  }

  /**
   * Check if text needs manual correction based on quality indicators
   */
  private needsManualCorrection(text: string): boolean {
    console.log('🔍 Starting needsManualCorrection check, text length:', text.length);
    
    // Low text length (probably empty or gibberish)
    if (text.length < 50) {  // Reduced threshold
      console.log('⚠️  Text too short (< 100 chars), needs correction');
      return true;
    }
    
    // Check if it contains meaningful property-related words (if not, likely gibberish)
    const propertyKeywords = ['LOTE', 'MANZANA', 'PREDIO', 'NORTE', 'SUR', 'ESTE', 'OESTE', 
                             'COLINDA', 'COLINDANCIA', 'METROS', 'LÍMITES', 'CONSTRUIDA',
                             'LIMITE', 'LIMITES', 'COLINDANTE', 'AREA', 'SUPERFICIE'];
    const textUpper = text.toUpperCase();
    const hasPropertyTerms = propertyKeywords.some(keyword => 
      textUpper.includes(keyword)
    );
    
    // Check text preview for debugging
    //const preview = text.substring(0, 500);
    console.log('Text preview full:', text);
    console.log('Property keywords check:', { hasPropertyTerms, textLength: text.length });
    
    // Check for garbled patterns that indicate OCR errors
    const garbledPatterns = [
      /\$\$+/,                           // Multiple dollar signs
      /[A-Z]{20,}/,                     // Very long ALLCAPS words (20+ chars)
      /[A-Z]+\d+[A-Z]+/,                // Letters-numbers-letters mixed pattern (like AIN9IYW)
      /\n\n[A-Z]{10,}\s+[A-Z]{10,}/,   // Multiple long ALLCAPS words on separate lines
      /\s{15,}/,                        // Excessive whitespace
    ];
    
    const garbledMatches = garbledPatterns.filter(pattern => pattern.test(text));
    const garbledCount = garbledMatches.length;
    
    console.log('Garbled patterns found:', garbledMatches.length, 'of', garbledPatterns.length);
    
    // Count suspicious patterns
    const suspiciousPatterns = [
      /[^a-zA-Z0-9\s.,]{3,}/,  // Multiple special characters
      /\d{10,}/,                // Very long numbers
    ];
    const suspiciousCount = suspiciousPatterns.filter(p => p.test(text)).length;
    
    console.log('Suspicious patterns found:', suspiciousCount);
    
    // Calculate readability score: ratio of recognized words to total content
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const totalWords = text.split(/\s+/).length;
    const garbledWords = text.split(/\s+/).filter(word => {
      const wordUpper = word.toUpperCase();
      // Check if word looks like gibberish (long caps, mixed chars, too many symbols)
      return /^[A-Z]{10,}$/.test(wordUpper) || 
             /[^a-zA-Z0-9]{2,}/.test(word) ||
             /[A-Z]+\d+[A-Z]+/.test(word);
    }).length;
    
    const garbledRatio = garbledWords / totalWords;
    console.log('Garbled words ratio:', garbledRatio, `(${garbledWords}/${totalWords} words)`);
    
    // If most of the text is garbled (even with some keywords), needs correction
    if (garbledRatio > 0.3) {
      console.log('⚠️  Too much garbled text, needs manual correction');
      return true;
    }
    
    // If no property terms OR if there are garbled patterns, needs correction
    if (!hasPropertyTerms || garbledCount >= 1 || suspiciousCount >= 1) {
      console.log('⚠️  Text quality is poor, needs manual correction');
      return true;
    }
    
    // Check for common OCR errors that indicate poor quality
    const errorPatterns = [
      /\$\$+/,                       // Multiple symbols
      /\n\n[A-Z]{10,}\n\n/,          // Long ALLCAPS between blank lines (gibberish)
      /[^a-zA-Z0-9\s]{5,}/,          // Multiple special chars in a row
      /\s{20,}/,                     // Excessive whitespace
      /[A-Z]{20,}/,                  // Very long all-caps words (gibberish)
    ];
    
    // Count error patterns found
    const errorCount = errorPatterns.reduce((count, pattern) => {
      return count + (pattern.test(text) ? 1 : 0);
    }, 0);
    
    console.log('Error patterns found:', errorCount);
    
    // If 2+ error patterns found OR no meaningful content, likely needs correction
    if (errorCount >= 2) {
      console.log('⚠️  Too many error patterns detected');
      return true;
    }
    
    return false;
  }


  /**
   * Extract measurement from text
   */
  private extractMeasurement(text: string): string {
    const match = text.match(/(\d+\.?\d*)/);
    return match ? match[1] : '0';
  }  

  /**
   * Get service status
   */
  getServiceStatus(): {
    openAI: boolean;
    mistral: boolean;
  } {
    const status = {
      openAI: openAIOCRService.isAvailable(),
      mistral: mistralOCRService.isAvailable(),
    };
    
    console.log('getServiceStatus called:', status);
    return status;
  }
}

// Export a singleton instance
export const enhancedOCRService = new EnhancedOCRService();

// Export the main function for backward compatibility
export async function processDocumentWithOCR(file: File): Promise<OCRResult> {
  return enhancedOCRService.processDocument(file);
}
