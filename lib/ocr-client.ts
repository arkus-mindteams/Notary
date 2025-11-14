async function rasterizePdfPageToPng(file: File, pageNumber: number = 1, rotationDeg: number = 0): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("pdf_rasterize_on_server")
  }
  console.log("[ocr-client] Rasterizing PDF → PNG", { name: file.name, pageNumber })
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf")
  if (pdfjs?.GlobalWorkerOptions) {
    const ver = (pdfjs as any).version || "4.8.69"
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${ver}/build/pdf.worker.min.js`
  }
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(Math.max(1, Math.min(pageNumber, pdf.numPages)))
  const viewport = page.getViewport({ scale: 2, rotation: rotationDeg as any })
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) throw new Error("canvas_unsupported")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const renderContext = { canvasContext: context, viewport }
  await page.render(renderContext as any).promise
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png")
  })
  return new File([blob], `${file.name.replace(/\\.[^.]+$/, "")}-p${pageNumber}-r${rotationDeg}.png`, { type: "image/png" })
}

type ProgressFn = (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void

export async function extractTextWithTextract(
  file: File,
  opts?: { page?: number; timeoutMs?: number; onProgress?: ProgressFn; preferredRotation?: number }
): Promise<{ text: string }> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 60000)
  try {
    let uploadFile = file
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      // Imagen -> flujo síncrono con intento de auto-rotación
      // Si el usuario eligió una rotación, aplicarla primero
      if (opts?.preferredRotation && opts.preferredRotation % 360 !== 0) {
        try {
          uploadFile = await rotateImageFile(uploadFile, opts.preferredRotation)
        } catch {}
      }
      const tryOnce = async (blobFile: File) => {
        const form = new FormData()
        form.append("file", blobFile)
        const res = await fetch("/api/ocr/extract", {
          method: "POST",
          body: form,
          signal: controller.signal,
        })
        if (!res.ok) return { text: "", linesCount: 0 }
        const data = await res.json()
        return { text: data?.text || "", linesCount: data?.linesCount ?? 0 }
      }
      opts?.onProgress?.("ocr_image", "in_progress")
      // Intento directo
      let best = await tryOnce(uploadFile)
      let bestRot = 0
      // Si es pobre, intenta rotaciones
      if ((best.linesCount || 0) < 3 || (best.text || "").length < 50) {
        opts?.onProgress?.("ocr_image_rotate", "in_progress")
        const rotations = [90, 180, 270]
        for (const rot of rotations) {
          const rotated = await rotateImageFile(uploadFile, rot)
          const res = await tryOnce(rotated)
          const score = res.linesCount * 10 + Math.min(res.text.length, 5000)
          const bestScore = best.linesCount * 10 + Math.min(best.text.length, 5000)
          if (score > bestScore) {
            best = res
            bestRot = rot
          }
        }
        opts?.onProgress?.("ocr_image_rotate", "done", `rotation=${bestRot}`)
      }
      opts?.onProgress?.("ocr_image", "done")
      return { text: best.text || "" }
    } else {
      // PDF -> intentar primero OCR síncrono rasterizando con rotaciones; si no hay buen resultado, usar asíncrono
      try {
        const rotations = [0, 90, 180, 270]
        // Si el usuario eligió una rotación preferida, probarla primero
        const pref = (opts?.preferredRotation ?? 0) % 360
        const ordered = pref && rotations.includes(pref) ? [pref, ...rotations.filter(r => r !== pref)] : rotations
        let bestText = ""
        let bestScore = -1
        opts?.onProgress?.("ocr_raster", "in_progress")
        for (const rot of ordered) {
          const png = await rasterizePdfPageToPng(file, opts?.page ?? 1, rot)
          const form = new FormData()
          form.append("file", png)
          const res = await fetch("/api/ocr/extract", {
            method: "POST",
            body: form,
            signal: controller.signal,
          })
          if (!res.ok) continue
          const data = await res.json()
          const text: string = data?.text || ""
          const linesCount: number = data?.linesCount ?? 0
          // Scoring: líneas + longitud + patrones de colindancias
          const dirMatches = (text.match(/\b(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\b/gi) || []).length
          const enMatches = (text.match(/\bEN\s+\d+(?:[.,]\d+)?\s*M\b/gi) || []).length
          const conMatches = (text.match(/\b(CON|COLINDA CON)\b/gi) || []).length
          const score = linesCount * 5 + Math.min(text.length, 4000) * 0.5 + (dirMatches + enMatches + conMatches) * 50
          if (score > bestScore) {
            bestScore = score
            bestText = text
          }
        }
        if (bestScore > 100 && bestText.trim().length > 0) {
          console.log("[ocr-client] Using rasterized rotated OCR", { bestScore })
          opts?.onProgress?.("ocr_raster", "done")
          return { text: bestText }
        }
      } catch (e) {
        console.warn("[ocr-client] Rotated raster attempt failed, fallback to async", e)
      }
      // Si no hubo un resultado razonable, usar asíncrono (S3 + Textract)
      console.log("[ocr-client] Async upload PDF (raster did not produce good score)")
      const upForm = new FormData()
      upForm.append("file", uploadFile)
      opts?.onProgress?.("ocr_upload", "in_progress")
      const up = await fetch("/api/ocr/async/upload", { method: "POST", body: upForm, signal: controller.signal })
      if (!up.ok) throw new Error(await up.text())
      const { bucket, key } = await up.json()
      opts?.onProgress?.("ocr_upload", "done")
      console.log("[ocr-client] Start async job", { bucket, key })
      opts?.onProgress?.("ocr_start", "in_progress")
      const st = await fetch("/api/ocr/async/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, key }),
        signal: controller.signal,
      })
      if (!st.ok) throw new Error(await st.text())
      const { jobId } = await st.json()
      opts?.onProgress?.("ocr_start", "done")
      console.log("[ocr-client] Polling status", { jobId })
      const started = Date.now()
      opts?.onProgress?.("ocr_status", "in_progress")
      while (true) {
        const resp = await fetch("/api/ocr/async/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
          signal: controller.signal,
        })
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        if (data.status === "SUCCEEDED") {
          console.log("[ocr-client] Async OCR done", { pages: data.pages })
          opts?.onProgress?.("ocr_status", "done")
          return { text: data.text || "" }
        }
        if (data.status === "FAILED") throw new Error("textract_async_failed")
        if (Date.now() - started > (opts?.timeoutMs ?? 60000)) throw new Error("textract_async_timeout")
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  } finally {
    clearTimeout(t)
  }
}

async function rotateImageFile(file: File, rotationDeg: number): Promise<File> {
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas_unsupported")
  const rad = (rotationDeg * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const newW = Math.round(bmp.width * cos + bmp.height * sin)
  const newH = Math.round(bmp.width * sin + bmp.height * cos)
  canvas.width = newW
  canvas.height = newH
  ctx.translate(newW / 2, newH / 2)
  ctx.rotate(rad)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png")
  })
  return new File([blob], `${file.name.replace(/\\.[^.]+$/, "")}-r${rotationDeg}.png`, { type: "image/png" })
}

