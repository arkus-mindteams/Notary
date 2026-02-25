import type { CaptureEngine } from '@/lib/ai/routing/capture-engines/types'
import { ChatGPTCaptureEngine } from '@/lib/ai/routing/capture-engines/chatgpt-capture-engine'
import { ChatGMICaptureEngine } from '@/lib/ai/routing/capture-engines/chatgmi-capture-engine'

export function createCaptureEngine(engine: string | null | undefined): CaptureEngine {
  const normalized = String(engine || 'gpt').trim().toLowerCase()
  if (normalized === 'gmi' || normalized === 'gemini') return new ChatGMICaptureEngine()
  return new ChatGPTCaptureEngine()
}
