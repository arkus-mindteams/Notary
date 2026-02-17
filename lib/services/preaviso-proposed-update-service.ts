import { ActivityLogService } from '@/lib/services/activity-log-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { computePreavisoState } from '@/lib/preaviso-state'
import { PreavisoWizardStateService } from '@/lib/services/preaviso-wizard-state-service'

type ProposedUpdate = {
  op?: string
  path?: string
  value?: unknown
  reason?: string
}

const ALLOWED_PATHS = [
  /^compradores\[\d+\]\.persona_fisica\.nombre$/,
  /^compradores\[\d+\]\.persona_fisica\.rfc$/,
  /^compradores\[\d+\]\.persona_fisica\.curp$/,
  /^compradores\[\d+\]\.persona_fisica\.estado_civil$/,
  /^inmueble\.folio_real$/,
  /^inmueble\.direccion\.(calle|numero|colonia|municipio|estado|codigo_postal)$/,
]

export class ProposedUpdateDomainViolationError extends Error {
  code = 'DOMAIN_RULE_VIOLATION'
}

export class PreavisoProposedUpdateService {
  static async commit(args: {
    tramiteId: string
    userId: string
    traceId: string
    proposedUpdates: ProposedUpdate[]
  }): Promise<{
    applied_updates: number
    data: any
    state: {
      current_state: string
      state_status: Record<string, string>
      required_missing: string[]
      blocking_reasons: string[]
      allowed_actions: string[]
      wizard_state: ReturnType<typeof PreavisoWizardStateService.fromSnapshot>
    }
  }> {
    if (!Array.isArray(args.proposedUpdates) || args.proposedUpdates.length === 0) {
      throw new ProposedUpdateDomainViolationError('No hay proposed_updates para aplicar')
    }

    const tramite = await TramiteService.findTramiteById(args.tramiteId)
    if (!tramite) {
      throw new ProposedUpdateDomainViolationError('Tramite no encontrado')
    }
    if (tramite.tipo !== 'preaviso') {
      throw new ProposedUpdateDomainViolationError('Solo se permite commit de propuestas para tramite preaviso')
    }

    const currentData = isPlainObject(tramite.datos) ? deepClone(tramite.datos) : {}
    let applied = 0

    for (const raw of args.proposedUpdates) {
      const op = String(raw?.op || '').trim().toLowerCase()
      const path = String(raw?.path || '').trim()
      if (op !== 'set') continue
      if (!path) continue
      if (!isAllowedPath(path)) {
        throw new ProposedUpdateDomainViolationError(`Path no permitido para commit: ${path}`)
      }
      setByPath(currentData, path, raw?.value)
      applied += 1
    }

    if (applied === 0) {
      throw new ProposedUpdateDomainViolationError('No hubo updates aplicables en proposed_updates')
    }

    const updated = await TramiteService.updateTramite(args.tramiteId, {
      datos: currentData,
    })

    const computed = computePreavisoState(updated.datos || {})
    const wizardState = PreavisoWizardStateService.fromSnapshot(
      computed.state.current_state,
      computed.state.state_status,
      computed.state.required_missing,
      computed.state.blocking_reasons
    )

    await ActivityLogService.logUserEvent({
      userId: args.userId,
      tramiteId: args.tramiteId,
      eventType: 'proposed_updates_commit',
      metadata: {
        trace_id: args.traceId,
        applied_updates: applied,
        paths: args.proposedUpdates.map((x) => String(x.path || '')).filter(Boolean),
      },
    })

    return {
      applied_updates: applied,
      data: updated.datos || {},
      state: {
        current_state: computed.state.current_state,
        state_status: computed.state.state_status,
        required_missing: computed.state.required_missing,
        blocking_reasons: computed.state.blocking_reasons,
        allowed_actions: computed.state.allowed_actions,
        wizard_state: wizardState,
      },
    }
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function setByPath(target: Record<string, any>, path: string, value: unknown) {
  const segments = parsePath(path)
  if (segments.length === 0) return

  let node: any = target
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    const nextKey = segments[i + 1]
    if (typeof key === 'number') {
      if (!Array.isArray(node)) {
        throw new ProposedUpdateDomainViolationError(`Path invalido: ${path}`)
      }
      if (node[key] === undefined || node[key] === null) {
        node[key] = typeof nextKey === 'number' ? [] : {}
      }
      node = node[key]
      continue
    }

    if (!isPlainObject(node[key])) {
      node[key] = typeof nextKey === 'number' ? [] : {}
    }
    node = node[key]
  }

  const last = segments[segments.length - 1]
  if (typeof last === 'number') {
    if (!Array.isArray(node)) {
      throw new ProposedUpdateDomainViolationError(`Path invalido: ${path}`)
    }
    node[last] = value
    return
  }

  node[last] = value
}

function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = []
  const regex = /([^[.\]]+)|\[(\d+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(path)) !== null) {
    if (match[1]) out.push(match[1])
    if (match[2]) out.push(Number(match[2]))
  }
  return out
}

