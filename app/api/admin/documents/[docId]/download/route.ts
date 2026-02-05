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

        // Check authentication - extract token from header for admin requests
        const authHeader = req.headers.get('authorization')
        const token = authHeader?.replace('Bearer ', '')

        const { data: { user }, error: authError } = token
            ? await supabase.auth.getUser(token)
            : await supabase.auth.getUser()

        if (authError || !user) {
            console.error('[download] Auth error:', authError)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify admin role
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('auth_user_id', user.id)
            .single()

        if (!usuario || (usuario.rol !== 'superadmin' && usuario.rol !== 'admin')) {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
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

        // If S3 path exists, generate signed URL using S3Service
        if (doc.s3_key) {
            try {
                const { S3Service } = await import('@/lib/services/s3-service')
                const signedUrl = await S3Service.getSignedUrl(doc.s3_key, 3600) // 1 hour expiry

                // Return the signed URL as JSON so the frontend can download it
                return NextResponse.json({
                    downloadUrl: signedUrl,
                    fileName: doc.nombre
                })
            } catch (urlError: any) {
                console.error('Error generating signed URL:', urlError)
                return NextResponse.json({ error: 'Error generating download link' }, { status: 500 })
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
