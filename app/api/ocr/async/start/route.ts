export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { TextractClient, StartDocumentTextDetectionCommand } from "@aws-sdk/client-textract"

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


