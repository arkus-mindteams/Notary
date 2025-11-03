"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2, FileSearch, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface ProcessingScreenProps {
  fileName: string
  onComplete: () => void
}

export function ProcessingScreen({ fileName, onComplete }: ProcessingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const hasCompletedRef = useRef(false)

  const steps = [
    { label: "Analizando documento", icon: FileSearch },
    { label: "Extrayendo medidas", icon: FileSearch },
    { label: "Identificando colindancias", icon: FileSearch },
    { label: "Generando texto notarial", icon: CheckCircle2 },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            if (!hasCompletedRef.current) {
              hasCompletedRef.current = true
              onComplete()
            }
          }, 500)
          return 100
        }
        return prev + 2
      })
    }, 60)

    return () => clearInterval(interval)
  }, []) // Empty dependency array - only run once

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))
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
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = index === currentStep
              const isComplete = index < currentStep

              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                    isActive ? "bg-primary/10 text-primary" : isComplete ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "animate-pulse" : ""}`} />
                  <span className="text-sm font-medium">{step.label}</span>
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
