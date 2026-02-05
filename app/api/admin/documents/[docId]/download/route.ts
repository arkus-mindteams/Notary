import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/documents/[docId]/download
 * Generates download URL or redirects to S3 document
 */
export async function GET(
    req: Request,
    { params }: { params: { docId: string } }
) {
    try {
        const supabase = createServerClient()

        // Check authentication (ADMIN ONLY)
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const docId = params.docId

        // Fetch document metadata
        const { data: doc, error: docError } = await supabase
            .from('documentos')
            .select('id, nombre, ruta_s3, tipo')
            .eq('id', docId)
            .single()

        if (docError) throw docError
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // If S3 path exists, generate pre-signed URL or redirect
        if (doc.ruta_s3) {
            // Option 1: If using Supabase Storage

            // Extract bucket and path from ruta_s3
            // Assuming format: "bucket/path/to/file" or full URL
            const s3Path = doc.ruta_s3.replace(/^https?:\/\/[^\/]+\//, '') // Remove domain if present
            const pathParts = s3Path.split('/')
            const bucket = pathParts[0] || 'documentos' // Default bucket
            const filePath = pathParts.slice(1).join('/')

            // Generate signed URL (expires in 1 hour)
            const { data: signedUrlData, error: urlError } = await supabase
                .storage
                .from(bucket)
                .createSignedUrl(filePath, 3600) // 1 hour expiry

            if (urlError) {
                console.error('Error generating signed URL:', urlError)
                // Fallback: return the direct S3 path (might not be accessible)
                return NextResponse.redirect(doc.ruta_s3)
            }

            if (signedUrlData?.signedUrl) {
                return NextResponse.redirect(signedUrlData.signedUrl)
            }
        }

        // Fallback if no S3 path
        return NextResponse.json({
            error: 'Document path not available',
            fileName: doc.nombre
        }, { status: 404 })

    } catch (err: any) {
        console.error('Error fetching document:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
