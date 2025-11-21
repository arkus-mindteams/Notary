export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const USE_STUBS =
  process.env.OCR_USE_STUBS === "1" || process.env.NEXT_PUBLIC_OCR_USE_STUBS === "1"

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    : undefined,
})

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "bad_request", message: "file is required" }, { status: 400 })
    const bucket = process.env.AWS_S3_BUCKET || process.env.OCR_S3_BUCKET
    if (USE_STUBS || !bucket) {
      // Demo/stub mode (e.g., bolt.new) or missing bucket
      const key =
        (process.env.OCR_S3_PREFIX || "uploads/") +
        `${Date.now()}-${(file.name || "document").replace(/\s+/g, "_").toLowerCase()}`
      return NextResponse.json({ bucket: bucket || "demo-bucket", key })
    }
    const arrayBuffer = await file.arrayBuffer()
    const body = new Uint8Array(arrayBuffer)
    const key =
      (process.env.OCR_S3_PREFIX || "uploads/") +
      `${Date.now()}-${(file.name || "document").replace(/\s+/g, "_").toLowerCase()}`
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: (file as any).type || "application/octet-stream",
      }),
    )
    return NextResponse.json({ bucket, key })
  } catch (e: any) {
    console.error("[api/ocr/async/upload] error:", e)
    return NextResponse.json({ error: "upload_failed", message: String(e?.message || e) }, { status: 400 })
  }
}


