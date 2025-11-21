export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract"

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
    console.log("[api/ocr/extract] Incoming request")
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "bad_request", message: "file is required" }, { status: 400 })
    }
    const contentType = (file as any).type || ""
    const size = (file as any).size
    console.log("[api/ocr/extract] File info", { contentType, size })
    if (!contentType || !(contentType.startsWith("image/"))) {
      return NextResponse.json(
        { error: "unsupported_media_type", message: `Only images are supported (got ${contentType || "unknown"})` },
        { status: 415 }
      )
    }
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    const detect = new DetectDocumentTextCommand({ Document: { Bytes: bytes } })
    const resp = await textract.send(detect)
    const lines = (resp?.Blocks || [])
      .filter((b) => b.BlockType === "LINE" && b.Text)
      .map((b) => b.Text)
    const text = lines.join("\n")
    return NextResponse.json({
      text,
      contentType,
      linesCount: lines.length,
    })
  } catch (e: any) {
    console.error("[api/ocr/extract] error:", e)
    return NextResponse.json({ error: "textract_failed", message: String(e?.message || e) }, { status: 400 })
  }
}

