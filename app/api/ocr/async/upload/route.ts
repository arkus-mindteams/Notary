export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

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
    if (!bucket) return NextResponse.json({ error: "missing_bucket", message: "AWS_S3_BUCKET not set" }, { status: 500 })
    const arrayBuffer = await file.arrayBuffer()
    const key =
      (process.env.OCR_S3_PREFIX || "uploads/") +
      `${Date.now()}-${(file.name || "document").replace(/\s+/g, "_").toLowerCase()}`
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(arrayBuffer),
        ContentType: (file as any).type || "application/pdf",
      }),
    )
    return NextResponse.json({ bucket, key })
  } catch (e: any) {
    console.error("[api/ocr/async/upload] error:", e)
    return NextResponse.json({ error: "upload_failed", message: String(e?.message || e) }, { status: 400 })
  }
}


