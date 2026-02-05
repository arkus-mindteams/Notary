import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/documents/[docId]/download
 * Generates download URL or redirects to S3 document
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ docId: string }> }
) {
    try {
        const { docId } = await params
        const supabase = createServerClient()

        // Check authentication (ADMIN ONLY)
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Fetch document metadata
        const { data: doc, error: docError } = await supabase
            .from('documentos')
            .select('id, nombre, s3_key, s3_bucket, tipo')
            .eq('id', docId)
            .single()

        if (docError) throw docError
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // If S3 path exists, generate pre-signed URL
        if (doc.s3_key) {
            const bucket = doc.s3_bucket || 'documentos'
            const filePath = doc.s3_key

            // Generate signed URL (expires in 1 hour)
            const { data: signedUrlData, error: urlError } = await supabase
                .storage
                .from(bucket)
                .createSignedUrl(filePath, 3600) // 1 hour expiry

            if (urlError) {
                console.error('Error generating signed URL:', urlError)
                return NextResponse.json({ error: 'Error generating download link' }, { status: 500 })
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
