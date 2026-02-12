import { CompradorService } from '@/lib/services/comprador-service'
import { TramiteService } from '@/lib/services/tramite-service'
import { DocumentoService } from '@/lib/services/documento-service'
import type { PreavisoData } from '@/lib/tramites/shared/types/preaviso-types'
import type { Usuario } from '@/lib/types/auth-types'
import type { Tramite } from '@/lib/types/expediente-types'

const DEFAULT_NOTARIA_ID = '00000000-0000-0000-0000-000000000001'

export class DomainRuleViolationError extends Error {
  code = 'DOMAIN_RULE_VIOLATION'
}

interface FinalizePreavisoInput {
  preavisoData: PreavisoData
  tramiteId?: string | null
  generatedDocument?: {
    formato?: 'docx' | 'pdf'
    titulo?: string
  }
}

interface FinalizePreavisoResult {
  compradorId: string
  tramiteId: string
  documentVersion: number
}

export class PreavisoDomainService {
  static async finalizePreaviso(
    input: FinalizePreavisoInput,
    currentUser: Usuario
  ): Promise<FinalizePreavisoResult> {
    const comprador = await this.resolveComprador(input.preavisoData, currentUser)

    let tramite: Tramite | null = null
    if (input.tramiteId) {
      tramite = await TramiteService.findTramiteById(input.tramiteId)
      if (!tramite) {
        throw new DomainRuleViolationError('El trámite especificado no existe')
      }
    }

    const datos = this.buildTramiteDatos(input.preavisoData)

    const savedTramite = tramite
      ? await TramiteService.updateTramite(tramite.id, {
          comprador_id: comprador.id,
          datos,
          estado: 'completado',
        })
      : await TramiteService.createTramite({
          compradorId: comprador.id,
          userId: currentUser.id,
          tipo: 'preaviso',
          datos,
          estado: 'completado',
        })

    await DocumentoService.updateDocumentosCompradorId(savedTramite.id, comprador.id)

    const currentVersion = Number((savedTramite.documento_generado as any)?.version || 0)
    const nextVersion = Number.isFinite(currentVersion) ? currentVersion + 1 : 1

    await TramiteService.updateTramite(savedTramite.id, {
      documento_generado: {
        formato: input.generatedDocument?.formato || 'docx',
        version: nextVersion,
        titulo:
          input.generatedDocument?.titulo ||
          'SOLICITUD DE CERTIFICADO CON EFECTO DE PRE-AVISO',
        generated_at: new Date().toISOString(),
        generated_by_user_id: currentUser.id,
        generated_by_auth_user_id: currentUser.auth_user_id,
      },
    })

    return {
      compradorId: comprador.id,
      tramiteId: savedTramite.id,
      documentVersion: nextVersion,
    }
  }

  private static async resolveComprador(preavisoData: PreavisoData, currentUser: Usuario) {
    const principal = preavisoData?.compradores?.[0]
    const nombre =
      principal?.persona_fisica?.nombre?.trim() ||
      principal?.persona_moral?.denominacion_social?.trim() ||
      null
    const curp = principal?.persona_fisica?.curp?.trim() || null
    const rfc = principal?.persona_fisica?.rfc?.trim() || principal?.persona_moral?.rfc?.trim() || null

    if (!nombre && !curp && !rfc) {
      throw new DomainRuleViolationError(
        'No se puede finalizar un preaviso sin datos mínimos del comprador principal'
      )
    }

    const notariaId = currentUser.notaria_id || DEFAULT_NOTARIA_ID

    if (curp) {
      const byCurp = await CompradorService.findCompradorByCURP(curp)
      if (byCurp) return byCurp
    }

    if (rfc) {
      const byRfc = await CompradorService.findCompradorByRFC(rfc)
      if (byRfc) return byRfc
    }

    if (nombre) {
      const candidates = await CompradorService.searchCompradores(nombre, 10, notariaId)
      const exact = candidates.find((item) => item.nombre?.trim().toUpperCase() === nombre.toUpperCase())
      if (exact) return exact
    }

    const syntheticCurp = curp || `TEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return CompradorService.createComprador({
      nombre: nombre || 'COMPRADOR SIN NOMBRE',
      curp: syntheticCurp,
      rfc: rfc ?? '',
      notaria_id: notariaId,
    })
  }

  private static buildTramiteDatos(preavisoData: PreavisoData) {
    return {
      tipoOperacion: preavisoData.tipoOperacion,
      vendedores: preavisoData.vendedores,
      compradores: preavisoData.compradores,
      creditos: preavisoData.creditos,
      gravamenes: preavisoData.gravamenes,
      inmueble: preavisoData.inmueble,
      actosNotariales: preavisoData.actosNotariales,
    }
  }
}
