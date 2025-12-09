export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { TextractClient, StartDocumentTextDetectionCommand } from "@aws-sdk/client-textract"

const USE_STUBS =
  process.env.RUN_WITHOUT_AWS === "1" || process.env.OCR_USE_STUBS === "1" || process.env.NEXT_PUBLIC_OCR_USE_STUBS === "1"

const textract = new TextractClient({
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
    const body = await req.json()
    const bucket = body?.bucket as string
    const key = body?.key as string
    if (!bucket || !key) return NextResponse.json({ error: "bad_request", message: "bucket and key required" }, { status: 400 })
    if (USE_STUBS || !process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      // Return a fake job id for environments without AWS credentials (e.g., bolt.new)
      return NextResponse.json({ jobId: `demo-${Date.now()}` })
    }
    const cmd = new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    })
    const resp = await textract.send(cmd)
    return NextResponse.json({ jobId: resp.JobId })
  } catch (e: any) {
    console.error("[api/ocr/async/start] error:", e)
    return NextResponse.json({ error: "start_failed", message: String(e?.message || e) }, { status: 400 })
  }
}


