import OpenAI from 'openai';

export interface PropertyUnit {
  id: string;
  name: string;
  surface: string;
  notarialText?: string;  // Unit-level aggregated notarial text
  boundaries: {
    norte: Boundary[];
    sur: Boundary[];
    este: Boundary[];
    oeste: Boundary[];
    noreste?: Boundary[];
    noroeste?: Boundary[];
    sureste?: Boundary[];
    suroeste?: Boundary[];
  };
}

export interface Boundary {
  id: string;
  measurement: string;
  unit: string;
  notarialText: string;
  regionId: string;
}

export interface ProcessedDocument {
  extractedUnits: PropertyUnit[];
  notarialText: string;
  confidence: number;
}

export class OpenAIDocumentProcessor {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set OPENAI_API_KEY environment variable.');
    }

    this.client = new OpenAI({ apiKey });
    console.log('OpenAIDocumentProcessor initialized with OpenAI API');
  }

  /**
   * Process document text using OpenAI GPT-4
   */
  async processDocumentText(text: string): Promise<ProcessedDocument> {
    try {
      console.log('Processing document with OpenAI GPT-4...');
      
      const prompt = this.createPrompt(text);      
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant specialized in processing Spanish legal documents for property boundaries (deslindes). You extract structured data and convert it to notarial text format following strict Spanish legal conventions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const generatedText = response.choices[0]?.message?.content || '';
      
      console.log('OpenAI GPT-4 processing completed');
      
      return this.parseResponse(generatedText);
      
    } catch (error: any) {
      console.error('OpenAI document processing error:', error);
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  /**
   * Create the prompt for OpenAI GPT-4
   */
  private createPrompt(documentText: string): string {
    return `
Eres un asistente de IA especializado en procesar documentos legales de deslindes y linderos de propiedades en español.

Analiza el siguiente texto del documento y extrae las unidades de propiedad con sus linderos. Devuelve los datos en el formato JSON exacto especificado abajo.

Texto del Documento:
${documentText}

Instrucciones:
1. Identifica todas las unidades de propiedad mencionadas en el documento
2. Para cada unidad, extrae:
   - Nombre/identificador de la unidad
   - Superficie/área
   - Mediciones de linderos para cada dirección cardinal (norte, sur, este, oeste, noreste, noroeste, sureste, suroeste)
3. Genera texto notarial apropiado en español
4. Proporciona una puntuación de confianza (0-1) para la precisión de la extracción

IMPORTANTE: Los linderos pueden variar y deben estar en español. Algunos ejemplos de descripciones de linderos en español:
- "CON UNIDAD [letra/número]"
- "CON ÁREA COMÚN (AC-[número])"
- "CON CUBO DE ILUMINACIÓN"
- "CON JUNTA CONSTRUCTIVA"
- "CON AREA COMUN DE SERVICIO [número] DE EDIFICIO [letra]"
- "CON CALLE [nombre]"
- "CON PREDIO [número]"
- "CON LOTE [número] MANZANA [letra/número]"

FORMATO NOTARIAL - Instrucciones de conversión:
Cada boundary debe tener un campo "notarialText" con el texto notarial INDIVIDUAL de ese lindero específico, siguiendo estas reglas estrictas:

1. CONVERSIÓN DE MEDIDAS EN MTS:
   - Las medidas en MTS (metros) deben convertirse al formato: "[número] metros [milímetros] milímetros"
   - Ejemplo: "6.750 MTS" → "seis metros setecientos cincuenta milímetros"
   - Ejemplo: "1.750 MTS" → "un metro setecientos cincuenta milímetros"
   - Ejemplo: "0.300 MTS" → "trescientos milímetros" (cuando no hay metros completos)
   - Los números deben escribirse en palabras en minúsculas

2. CONVERSIÓN DE NÚMEROS A PALABRAS:
   - Usa las palabras en español: uno, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez...
   - Para cientos: ciento, doscientos, trescientos, cuatrocientos, quinientos, seiscientos, setecientos, ochocientos, novecientos
   - Ejemplos: 750 → "setecientos cincuenta", 60 → "sesenta"

3. CONVERSIÓN DE DESCRIPCIONES:
   - "CON UNIDAD B-4" → "con unidad B guion cuatro" (los números después de guión en palabras)
   - "CON CUBO DE ILUMINACION" → "con vacío de cubo de iluminación"
   - "CON ÁREA COMÚN" → "con área común"
   - Todas las descripciones deben estar en minúsculas (excepto nombres propios si los hay)
   - Los guiones deben convertirse a "guion" seguido del número en palabras

4. FORMATO DEL TEXTO NOTARIAL INDIVIDUAL:
   - El campo "notarialText" de cada boundary debe contener SOLO el texto de ese lindero específico
   - Formato: "[medida convertida], [descripción convertida]"
   - Ejemplo para un lindero: "seis metros setecientos cincuenta milímetros, con unidad B guion cuatro"
   - Ejemplo para otro lindero: "un metro setecientos cincuenta milímetros, con vacío de cubo de iluminación"
   - NO incluyas la dirección ni el nombre de la unidad en el notarialText individual

Formato JSON de respuesta (Solo devuelve JSON válido):
{
  "extractedUnits": [
    {
      "id": "U001",
      "name": "UNIDAD B-2",
      "surface": "85.50 M2",
      "boundaries": {
        "norte": [
          {
            "id": "norte-1",
            "measurement": "6.000",
            "unit": "MTS",
            "notarialText": "seis metros, con unidad B guion uno",
            "regionId": "r1"
          }
        ],
        "sur": [],
        "este": [
          {
            "id": "este-1",
            "measurement": "8.500",
            "unit": "MTS",
            "notarialText": "ocho metros quinientos milímetros, con área común",
            "regionId": "r2"
          }
        ],
        "oeste": [],
        "noreste": [],
        "noroeste": [],
        "sureste": [],
        "suroeste": []
      }
    }
  ],
  "confidence": 0.95
}

INSTRUCCIONES FINALES:
- Devuelve SOLO el JSON, sin texto adicional antes o después
- Asegúrate de que el JSON sea válido
- Si una dirección no tiene linderos, usa un array vacío []
- El campo "id" de cada boundary debe ser único dentro de la unidad
- El campo "regionId" debe ser único por boundary
- El campo "notarialText" es OBLIGATORIO para cada boundary
`;
  }

  /**
   * Parse OpenAI response into ProcessedDocument
   */
  private parseResponse(responseText: string): ProcessedDocument {
    try {
      console.log('[OpenAI] Parsing response...');
      console.log('[OpenAI] Response preview:', responseText.substring(0, 500));
      
      // Try to extract JSON from the response
      let jsonText = responseText.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const parsed = JSON.parse(jsonText);
      
      console.log('[OpenAI] Parsed JSON structure:', {
        hasExtractedUnits: !!parsed.extractedUnits,
        unitsCount: parsed.extractedUnits?.length || 0,
        confidence: parsed.confidence
      });
      
      // Validate and process units
      if (!parsed.extractedUnits || !Array.isArray(parsed.extractedUnits)) {
        throw new Error('Invalid response format: missing extractedUnits array');
      }
      
      const extractedUnits = parsed.extractedUnits
        .filter((unit: any) => {
          const hasId = unit && unit.id;
          const hasName = unit && unit.name;
          const hasBoundaries = unit && unit.boundaries;
          
          if (!hasId || !hasName || !hasBoundaries) {
            console.log('[OpenAI] Filtering invalid unit:', unit);
            return false;
          }
          
          // Check if unit has at least one boundary direction with data
          const hasAnyBoundary = Object.values(unit.boundaries).some((boundaries: any) => 
            Array.isArray(boundaries) && boundaries.length > 0
          );
          
          if (!hasAnyBoundary) {
            console.log(`[OpenAI] Filtering unit ${unit.id} with no boundaries`);
            return false;
          }
          
          return true;
        })
        .map((unit: any) => {
          // Ensure all boundary directions exist and are arrays
          return {
            ...unit,
            boundaries: {
              norte: Array.isArray(unit.boundaries.norte) ? unit.boundaries.norte : [],
              sur: Array.isArray(unit.boundaries.sur) ? unit.boundaries.sur : [],
              este: Array.isArray(unit.boundaries.este) ? unit.boundaries.este : [],
              oeste: Array.isArray(unit.boundaries.oeste) ? unit.boundaries.oeste : [],
              noreste: Array.isArray(unit.boundaries.noreste) ? unit.boundaries.noreste : [],
              noroeste: Array.isArray(unit.boundaries.noroeste) ? unit.boundaries.noroeste : [],
              sureste: Array.isArray(unit.boundaries.sureste) ? unit.boundaries.sureste : [],
              suroeste: Array.isArray(unit.boundaries.suroeste) ? unit.boundaries.suroeste : [],
            }
          };
        });
      
      if (extractedUnits.length === 0) {
        throw new Error('No valid units extracted from document');
      }
      
      console.log('[OpenAI] Successfully extracted units:', extractedUnits.map(u => ({ 
        id: u.id, 
        name: u.name, 
        surface: u.surface 
      })));
      
      return {
        extractedUnits,
        notarialText: '',
        confidence: parsed.confidence || 0.8
      };
      
    } catch (error) {
      console.error('[OpenAI] Error parsing response:', error);
      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export a singleton instance
let openAIDocumentProcessorInstance: OpenAIDocumentProcessor | null = null;

export function getOpenAIDocumentProcessor(): OpenAIDocumentProcessor {
  if (!openAIDocumentProcessorInstance) {
    openAIDocumentProcessorInstance = new OpenAIDocumentProcessor();
  }
  return openAIDocumentProcessorInstance;
}

// Export singleton for backward compatibility
export const openAIDocumentProcessor = {
  async processDocumentText(text: string): Promise<ProcessedDocument> {
    const processor = getOpenAIDocumentProcessor();
    return processor.processDocumentText(text);
  }
};

