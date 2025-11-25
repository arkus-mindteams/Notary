async function rasterizePdfPageToPng(file: File, pageNumber: number = 1, rotationDeg: number = 0): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("pdf_rasterize_on_server")
  }
  console.log("[ocr-client] Rasterizing PDF → PNG", { name: file.name, pageNumber })
  const pdfjsModule: any = await import("pdfjs-dist/legacy/build/pdf")
  const pdfjs = pdfjsModule?.default || pdfjsModule
  
  if (!pdfjs?.getDocument || !pdfjs.GlobalWorkerOptions) {
    throw new Error("No se pudo inicializar pdf.js correctamente.")
  }
  
  // Configure worker - use the same method as pdf-viewer.tsx
  const pdfVersion = pdfjs.version || '5.4.296'
  const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`
  
  try {
    // Fetch worker and create blob URL to avoid CORS issues
    const workerResponse = await fetch(workerUrl)
    if (workerResponse.ok) {
      const workerText = await workerResponse.text()
      const workerBlob = new Blob([workerText], { 
        type: 'application/javascript' 
      })
      const blobUrl = URL.createObjectURL(workerBlob)
      pdfjs.GlobalWorkerOptions.workerSrc = blobUrl
    } else {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    }
  } catch (fetchError) {
    console.warn('[ocr-client] Failed to load worker as blob, using direct URL:', fetchError)
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
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

/**
 * Convert all pages of a PDF file to PNG images (one image per page)
 * Converts PDFs directly in the browser using pdfjs-dist (client-side only)
 * This avoids server-side dependencies and works well with Next.js serverless
 * @param file PDF file to convert
 * @param rotationDeg Rotation in degrees (0, 90, 180, 270)
 * @param onProgress Progress callback
 * @returns Array of File objects, one per page
 */
export async function convertPdfToImages(
  file: File,
  rotationDeg: number = 0,
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  if (typeof window === "undefined") {
    throw new Error("PDF conversion must be done in the browser")
  }

  console.log("[ocr-client] Converting PDF to images in browser", { name: file.name })
  
  // Import pdfjs-dist dynamically
  const pdfjsModule: any = await import("pdfjs-dist/legacy/build/pdf")
  const pdfjs = pdfjsModule?.default || pdfjsModule
  
  if (!pdfjs?.getDocument || !pdfjs.GlobalWorkerOptions) {
    throw new Error("No se pudo inicializar pdf.js correctamente.")
  }
  
  // Configure worker - use the same method as pdf-viewer.tsx
  const pdfVersion = pdfjs.version || '5.4.296'
  const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`
  
  try {
    // Fetch worker and create blob URL to avoid CORS issues (same as pdf-viewer.tsx)
    const workerResponse = await fetch(workerUrl)
    if (workerResponse.ok) {
      const workerText = await workerResponse.text()
      // Create blob with proper type for ES module worker
      const workerBlob = new Blob([workerText], { 
        type: 'application/javascript' 
      })
      const blobUrl = URL.createObjectURL(workerBlob)
      pdfjs.GlobalWorkerOptions.workerSrc = blobUrl
    } else {
      // Fallback to direct CDN URL
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    }
  } catch (fetchError) {
    // If fetch fails, try direct URL (might work if CDN has CORS)
    console.warn('[ocr-client] Failed to load worker as blob, using direct URL:', fetchError)
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  }
  
  // Load PDF document
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  
  const totalPages = pdf.numPages
  const files: File[] = []
  
  // Convert each page to image
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.0, rotation: rotationDeg as any })
    
    // Create canvas element
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) throw new Error("canvas_unsupported")
    
    canvas.width = viewport.width
    canvas.height = viewport.height
    
    // Render page to canvas
    await page.render({ canvasContext: context, viewport }).promise
    
    // Convert canvas to blob
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob_failed"))), "image/png")
    })
    
    // Create File object
    const fileName = file.name.replace(/\.[^.]+$/, "") || "document"
    const imageFile = new File(
      [blob],
      `${fileName}-page-${pageNum}.png`,
      { type: "image/png" }
    )
    
    files.push(imageFile)
    onProgress?.(pageNum, totalPages)
  }
  
  console.log("[ocr-client] PDF conversion complete", { pages: files.length })
  return files
}

type ProgressFn = (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void

export interface TextractResult {
  text: string
  /**
   * Heurística 0–1 de qué tan “rico”/legible es el texto extraído
   * (líneas, longitud, presencia de patrones de colindancias, etc.).
   */
  confidence: number
  /**
   * Rotación (en grados) que produjo el mejor resultado, si aplica.
   */
  bestRotation?: number
  /**
   * Origen principal del OCR (útil para mensajes al usuario).
   */
  source: "image_direct" | "image_rotated" | "pdf_raster" | "pdf_async"
}

export async function extractTextWithTextract(
  file: File,
  opts?: { page?: number; timeoutMs?: number; onProgress?: ProgressFn; preferredRotation?: number }
): Promise<TextractResult> {
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
      // Calcular confianza heurística para imagen
      const rawScore = best.linesCount * 10 + Math.min(best.text.length, 5000)
      const confidence = Math.max(0, Math.min(1, rawScore / 8000))
      opts?.onProgress?.(
        "ocr_image",
        "done",
        `confidence=${Math.round(confidence * 100)};rotation=${bestRot}`
      )
      return {
        text: best.text || "",
        confidence,
        bestRotation: bestRot || undefined,
        source: bestRot ? "image_rotated" : "image_direct",
      }
    } else {
      // PDF -> intentar primero OCR síncrono rasterizando con rotaciones; si no hay buen resultado, usar asíncrono
      try {
        const rotations = [0, 90, 180, 270]
        // Si el usuario eligió una rotación preferida, probarla primero
        const pref = (opts?.preferredRotation ?? 0) % 360
        const ordered = pref && rotations.includes(pref) ? [pref, ...rotations.filter(r => r !== pref)] : rotations
        let bestText = ""
        let bestScore = -1
        let bestRot = 0
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
          const dirMatches =
            (text.match(
              /\b(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\b/gi
            ) || []).length
          const enMatches = (text.match(/\bEN\s+\d+(?:[.,]\d+)?\s*M\b/gi) || []).length
          const conMatches = (text.match(/\b(CON|COLINDA CON)\b/gi) || []).length
          const score =
            linesCount * 5 +
            Math.min(text.length, 4000) * 0.5 +
            (dirMatches + enMatches + conMatches) * 50
          if (score > bestScore) {
            bestScore = score
            bestText = text
            bestRot = rot
          }
        }
        if (bestScore > 100 && bestText.trim().length > 0) {
          const confidence = Math.max(0, Math.min(1, bestScore / 8000))
          console.log("[ocr-client] Using rasterized rotated OCR", { bestScore, bestRot, confidence })
          opts?.onProgress?.(
            "ocr_raster",
            "done",
            `confidence=${Math.round(confidence * 100)};rotation=${bestRot}`
          )
          return {
            text: bestText,
            confidence,
            bestRotation: bestRot || undefined,
            source: "pdf_raster",
          }
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
          const text: string = data.text || ""
          const dirMatches =
            (text.match(
              /\b(AL\s+)?(NOROESTE|NORESTE|SURESTE|SUROESTE|NORTE|SUR|ESTE|OESTE|ARRIBA|ABAJO|SUPERIOR|INFERIOR)\b/gi
            ) || []).length
          const enMatches = (text.match(/\bEN\s+\d+(?:[.,]\d+)?\s*M\b/gi) || []).length
          const conMatches = (text.match(/\b(CON|COLINDA CON)\b/gi) || []).length
          const rawScore =
            Math.min(text.length, 8000) * 0.5 + (dirMatches + enMatches + conMatches) * 50
          const confidence = Math.max(0, Math.min(1, rawScore / 8000))
          opts?.onProgress?.(
            "ocr_status",
            "done",
            `confidence=${Math.round(confidence * 100)}`
          )
          return {
            text,
            confidence,
            bestRotation: undefined,
            source: "pdf_async",
          }
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

