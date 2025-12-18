import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    : undefined,
})

const BUCKET = process.env.AWS_S3_BUCKET || process.env.OCR_S3_BUCKET || 'notaria-expedientes'

export interface UploadFileOptions {
  file: File | Buffer
  key: string
  contentType?: string
  metadata?: Record<string, string>
}

export interface S3FileInfo {
  bucket: string
  key: string
  url?: string
}

export class S3Service {
  /**
   * Estructura de carpetas en S3:
   * 
   * expedientes/
   *   {compradorId}/
   *     tramites/
   *       {tramiteId}/
   *         {tipoTramite}/          (preaviso, plano_arquitectonico, etc.)
   *           {tipoDocumento}/      (escritura, ine_comprador, etc.)
   *             {año}/{mes}/
   *               {timestamp}-{fileName}
   *     documentos/                 (documentos sin trámite específico)
   *       {tipoDocumento}/
   *         {año}/{mes}/
   *           {timestamp}-{fileName}
   *     generados/                  (documentos generados por el sistema)
   *       {tipoTramite}/
   *         {año}/{mes}/
   *           {timestamp}-{fileName}
   */

  /**
   * Sanitiza el nombre de archivo para S3
   */
  private static sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
  }

  /**
   * Obtiene prefijo de año/mes para organización temporal
   */
  private static getYearMonthPrefix(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}/${month}`
  }

  /**
   * Genera una key estructurada para almacenar archivos de un trámite
   * 
   * Estructura: expedientes/{compradorId}/tramites/{tramiteId}/{tipoTramite}/{tipoDocumento}/{año}/{mes}/{timestamp}-{fileName}
   * 
   * Ejemplo: expedientes/abc123/tramites/xyz789/preaviso/escritura/2025/12/1733256000000-escritura_propiedad.pdf
   * 
   * Si compradorId empieza con "temp-", se usa estructura temporal
   */
  static generateKey(
    compradorId: string, 
    tramiteId: string, 
    tipoTramite: string,
    tipoDocumento: string, 
    fileName: string
  ): string {
    const sanitizedFileName = this.sanitizeFileName(fileName)
    const timestamp = Date.now()
    const yearMonth = this.getYearMonthPrefix()
    
    // Si es temporal (sin comprador aún), usar estructura temporal
    if (compradorId.startsWith('temp-')) {
      const tempId = compradorId.replace('temp-', '')
      return `expedientes/_temp/${tempId}/tramites/${tramiteId}/${tipoTramite}/${tipoDocumento}/${yearMonth}/${timestamp}-${sanitizedFileName}`
    }
    
    return `expedientes/${compradorId}/tramites/${tramiteId}/${tipoTramite}/${tipoDocumento}/${yearMonth}/${timestamp}-${sanitizedFileName}`
  }

  /**
   * Genera una key para documentos del comprador (sin trámite específico)
   * 
   * Estructura: expedientes/{compradorId}/documentos/{tipoDocumento}/{año}/{mes}/{timestamp}-{fileName}
   * 
   * Ejemplo: expedientes/abc123/documentos/ine_comprador/2025/12/1733256000000-ine.pdf
   * 
   * Si compradorId empieza con "temp-", se usa estructura temporal
   */
  static generateKeyForComprador(compradorId: string, tipoDocumento: string, fileName: string): string {
    const sanitizedFileName = this.sanitizeFileName(fileName)
    const timestamp = Date.now()
    const yearMonth = this.getYearMonthPrefix()
    
    // Si es temporal (sin comprador aún), usar estructura temporal
    if (compradorId.startsWith('temp-')) {
      const tempId = compradorId.replace('temp-', '')
      return `expedientes/_temp/${tempId}/documentos/${tipoDocumento}/${yearMonth}/${timestamp}-${sanitizedFileName}`
    }
    
    return `expedientes/${compradorId}/documentos/${tipoDocumento}/${yearMonth}/${timestamp}-${sanitizedFileName}`
  }

  /**
   * Genera una key para documentos generados por el sistema (Word, PDF, etc.)
   * 
   * Estructura: expedientes/{compradorId}/generados/{tipoTramite}/{año}/{mes}/{timestamp}-{fileName}
   * 
   * Ejemplo: expedientes/abc123/generados/preaviso/2025/12/1733256000000-preaviso_compraventa.docx
   */
  static generateKeyForGeneratedDocument(
    compradorId: string, 
    tipoTramite: string, 
    fileName: string
  ): string {
    const sanitizedFileName = this.sanitizeFileName(fileName)
    const timestamp = Date.now()
    const yearMonth = this.getYearMonthPrefix()
    
    return `expedientes/${compradorId}/generados/${tipoTramite}/${yearMonth}/${timestamp}-${sanitizedFileName}`
  }

  /**
   * Genera una key para archivos temporales o de procesamiento
   * 
   * Estructura: temp/{tipo}/{año}/{mes}/{timestamp}-{fileName}
   * 
   * Ejemplo: temp/ocr/2025/12/1733256000000-imagen_procesada.png
   */
  static generateKeyForTemp(tipo: string, fileName: string): string {
    const sanitizedFileName = this.sanitizeFileName(fileName)
    const timestamp = Date.now()
    const yearMonth = this.getYearMonthPrefix()
    
    return `temp/${tipo}/${yearMonth}/${timestamp}-${sanitizedFileName}`
  }

  /**
   * Sube un archivo a S3
   */
  static async uploadFile(options: UploadFileOptions): Promise<S3FileInfo> {
    const { file, key, contentType, metadata } = options

    if (!BUCKET) {
      throw new Error('AWS_S3_BUCKET environment variable is not set')
    }

    const arrayBuffer = file instanceof File 
      ? await file.arrayBuffer() 
      : file
    const body = new Uint8Array(arrayBuffer)

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType || (file instanceof File ? file.type : 'application/octet-stream'),
        Metadata: metadata,
      })
    )

    return {
      bucket: BUCKET,
      key,
    }
  }

  /**
   * Obtiene una URL firmada para descargar un archivo
   */
  static async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!BUCKET) {
      throw new Error('AWS_S3_BUCKET environment variable is not set')
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })

    return await getSignedUrl(s3Client, command, { expiresIn })
  }

  /**
   * Elimina un archivo de S3
   */
  static async deleteFile(key: string): Promise<void> {
    if (!BUCKET) {
      throw new Error('AWS_S3_BUCKET environment variable is not set')
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    )
  }

  /**
   * Obtiene información del bucket configurado
   */
  static getBucket(): string {
    return BUCKET
  }
}

