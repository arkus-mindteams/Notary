"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2, FileSearch, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface ProcessingScreenProps {
  fileName: string
  onComplete: () => void
  onRun?: (update: (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => void) => Promise<void>
  watchdogMs?: number
  steps?: Array<{ key: string; label: string }>
}

export function ProcessingScreen({ fileName, onComplete, onRun, watchdogMs, steps }: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [started, setStarted] = useState(false)
  const [stepStatus, setStepStatus] = useState<Record<string, { status: "pending" | "in_progress" | "done" | "error"; detail?: string }>>({})
  const hasRunRef = useRef(false)
  const onRunRef = useRef(onRun)
  const onCompleteRef = useRef(onComplete)

  // Mantener referencias actualizadas sin causar re-renders
  useEffect(() => {
    onRunRef.current = onRun
    onCompleteRef.current = onComplete
  }, [onRun, onComplete])

  const defaultSteps = [
    { key: "ocr", label: "OCR (Textract)" },
    { key: "ai", label: "AI (Structure)" },
  ]
  const stepsToUse = steps && steps.length > 0 ? steps : defaultSteps
  const labelByKey = Object.fromEntries(stepsToUse.map(s => [s.key, s.label]))

  useEffect(() => {
    let interval: any
    interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 2
      })
    }, 60)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Protección contra ejecuciones duplicadas (React Strict Mode)
    if (hasRunRef.current) {
      console.log("[ProcessingScreen] Ya se ejecutó, evitando ejecución duplicada")
      return
    }
    
    let cancelled = false
    let watchdog: any
    async function run() {
      if (started || hasRunRef.current) return
      hasRunRef.current = true
      setStarted(true)
      setStepStatus(Object.fromEntries(stepsToUse.map(s => [s.key, { status: "pending" as const }])))
      // Watchdog para evitar quedarse pegado
      watchdog = setTimeout(() => {
        if (!cancelled) {
          setProgress(100)
          onCompleteRef.current()
        }
      }, typeof watchdogMs === "number" ? watchdogMs : 20000)
      try {
        const currentOnRun = onRunRef.current
        if (currentOnRun) {
          const update = (key: string, status: "pending" | "in_progress" | "done" | "error", detail?: string) => {
            setStepStatus((prev) => ({ ...prev, [key]: { status, detail } }))
            const idx = stepsToUse.findIndex(s => s.key === key)
            if (idx >= 0) setCurrentStep(idx)
          }
          await currentOnRun(update)
        } else {
          setStepStatus(Object.fromEntries(stepsToUse.map(s => [s.key, { status: "done" as const }])))
        }
        if (!cancelled) {
          setProgress(100)
          setTimeout(() => onCompleteRef.current(), 150)
        }
      } catch (e) {
        if (!cancelled) {
          setProgress(100)
          setTimeout(() => onCompleteRef.current(), 150)
        }
      } finally {
        if (watchdog) clearTimeout(watchdog)
      }
    }
    run()
    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
    }
  }, []) // Ejecutar solo una vez al montar, usando refs para las funciones actuales

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, stepsToUse.length - 1))
    }, 750)

    return () => clearInterval(stepInterval)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-2xl p-8">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-2xl font-semibold">Procesando documento</h2>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>

          <div className="space-y-4">
            <Progress value={progress} className="h-2" />
            <p className="text-center text-sm font-medium">{progress}%</p>
          </div>

          <div className="space-y-3">
            {stepsToUse.map((step, index) => {
              const s = stepStatus[step.key]?.status || "pending"
              const isActive = s === "in_progress"
              const isComplete = s === "done"

              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    isActive ? "bg-primary/10 text-primary" : isComplete ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  <Loader2 className={`h-5 w-5 ${isActive ? "animate-spin" : "opacity-30"}`} />
                  <span className="text-sm font-medium">{labelByKey[step.key]}</span>
                  {isComplete && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}
