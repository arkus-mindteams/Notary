"use client"
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import {
    CheckCircle2,
    AlertCircle,
    CreditCard,
    Building2,
    UserCircle,
    Users,
    FileCheck2,
    FolderOpen,
    EyeOff,
    ChevronDown,
    ChevronUp
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
    PreavisoData,
    ServerStateSnapshot
} from '@/lib/tramites/shared/types/preaviso-types'

interface DocumentSidebarProps {
    data: PreavisoData
    serverState: ServerStateSnapshot | null
    isVisible: boolean
    onClose?: () => void
    bottomActions?: ReactNode
    onSelectFolioCandidate?: (folio: string) => void
    onSelectUncategorizedPerson?: (name: string) => void
}

export function DocumentSidebar({
    data,
    serverState,
    isVisible,
    onClose,
    bottomActions,
    onSelectFolioCandidate,
    onSelectUncategorizedPerson,
}: DocumentSidebarProps) {
    if (!isVisible) return null
    const [showDetectedDetails, setShowDetectedDetails] = useState(true)
    const [showPeopleDetected, setShowPeopleDetected] = useState(true)

    const folioConfirmed = Boolean(
        (data as any)?.folios?.selection?.confirmed_by_user ||
        data?.inmueble?.folio_real_confirmed
    )

    const getStepStatus = (stateId: string): 'pending' | 'completed' | 'blocked' => {
        const wizardStep = serverState?.wizard_state?.steps?.find((s) => s.state_id === stateId)
        if (wizardStep) return wizardStep.status

        const raw = serverState?.state_status?.[stateId]
        if (raw === 'completed' || raw === 'not_applicable') return 'completed'
        if (raw === 'incomplete') return 'blocked'
        return 'pending'
    }
    const buyerStepCompleted = getStepStatus('ESTADO_4') === 'completed'

    useEffect(() => {
        if (folioConfirmed) {
            setShowDetectedDetails(false)
        }
    }, [folioConfirmed])

    useEffect(() => {
        if (buyerStepCompleted) {
            setShowPeopleDetected(false)
        }
    }, [buyerStepCompleted])

    const progress = (() => {
        if (serverState?.wizard_state) {
            const total = serverState.wizard_state.total_steps
            const completed = serverState.wizard_state.steps.filter((s) => s.status === 'completed').length
            return {
                completed,
                total,
                percentage: total > 0 ? (completed / total) * 100 : 0
            }
        }

        const total = 6
        const stateIds = ['ESTADO_1', 'ESTADO_2', 'ESTADO_3', 'ESTADO_4', 'ESTADO_5', 'ESTADO_6']
        const completed = stateIds.filter((id) => {
            const v = serverState?.state_status?.[id]
            return v === 'completed' || v === 'not_applicable'
        }).length
        return {
            completed,
            total,
            percentage: (completed / total) * 100
        }
    })()


    const normalizeName = (str: string | null | undefined): string => {
        if (!str) return ''
        return str.toLowerCase().trim().replace(/\s+/g, ' ')
    }

    const isValidDetectedPersonName = (value: unknown): boolean => {
        const raw = String(value || '').trim()
        if (!raw) return false
        const normalized = raw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        if (!normalized) return false
        if (
            normalized.includes('[redacted]') ||
            normalized.includes('redacted') ||
            normalized === 'n/a' ||
            normalized === 'na' ||
            normalized === 'null' ||
            normalized === 'undefined' ||
            normalized === 'desconocido' ||
            normalized === 'sin dato' ||
            normalized === 'no disponible'
        ) {
            return false
        }
        return /[a-z]/i.test(raw)
    }

    const uncategorizedPeople = (() => {
        const classified = new Set<string>()
        for (const v of Array.isArray(data?.vendedores) ? data.vendedores : []) {
            const n = normalizeName(v?.persona_fisica?.nombre || v?.persona_moral?.denominacion_social)
            if (n) classified.add(n)
        }
        for (const c of Array.isArray(data?.compradores) ? data.compradores : []) {
            const n = normalizeName(c?.persona_fisica?.nombre || c?.persona_moral?.denominacion_social)
            if (n) classified.add(n)
            const spouse = normalizeName(c?.persona_fisica?.conyuge?.nombre)
            if (spouse) classified.add(spouse)
        }
        const pendingPersons = Array.isArray((data as any)?._document_people_pending?.persons)
            ? (data as any)._document_people_pending.persons
            : []
        const rawUncategorized = Array.isArray((data as any)?.personas_detectadas_no_clasificadas)
            ? (data as any).personas_detectadas_no_clasificadas
            : []
        const detectedSpouses = Array.isArray((data as any)?.conyuges_detectados)
            ? (data as any).conyuges_detectados
            : []
        const merged = [...pendingPersons, ...rawUncategorized, ...detectedSpouses]
        const dedup = new Map<string, { name: string; rfc?: string | null; curp?: string | null }>()
        for (const person of merged) {
            const name = String(person?.name || person?.nombre || '').trim()
            if (!isValidDetectedPersonName(name)) continue
            if (!name) continue
            const key = normalizeName(name)
            if (!key) continue
            if (classified.has(key)) continue
            if (!dedup.has(key)) {
                dedup.set(key, {
                    name,
                    rfc: person?.rfc ?? null,
                    curp: person?.curp ?? null
                })
            }
        }
        return Array.from(dedup.values())
    })()

    const folioCandidates = (() => {
        const candidates = Array.isArray((data as any)?.folios?.candidates)
            ? (data as any).folios.candidates
            : []
        const dedup = new Set<string>()
        for (const c of candidates) {
            const folio = String(c?.folio || '').replace(/\D/g, '').trim()
            if (!folio) continue
            dedup.add(folio)
        }
        return Array.from(dedup.values())
    })()
    const normalizedSelectedFolio = String(data?.inmueble?.folio_real || '').replace(/\D/g, '').trim()
    const hasResolvedSingleFolioCandidate =
        folioCandidates.length === 1 &&
        Boolean(normalizedSelectedFolio) &&
        normalizedSelectedFolio === folioCandidates[0]
    const shouldRenderFolioCandidates = folioCandidates.length > 0 && !hasResolvedSingleFolioCandidate
    const hasMultipleUnresolvedFolios =
        folioCandidates.length > 1 &&
        !folioConfirmed &&
        !normalizedSelectedFolio

    const hasSellerName =
        Boolean(data?.vendedores?.[0]?.persona_fisica?.nombre) ||
        Boolean(data?.vendedores?.[0]?.persona_moral?.denominacion_social)

    const sellerStepStatus: 'pending' | 'completed' | 'blocked' =
        getStepStatus('ESTADO_3') === 'completed' && !hasSellerName
            ? 'pending'
            : getStepStatus('ESTADO_3')

    return (
        <Card className={`${onClose
            ? 'w-full shadow-xl border border-gray-200 rounded-2xl mb-4'
            : 'w-80 border-l border-gray-200 rounded-none shadow-none'
            } bg-white flex flex-col ${onClose ? 'h-auto mb-8' : 'h-full'} overflow-hidden`}>
            <CardContent className={`p-0 flex flex-col ${onClose ? 'h-auto' : 'h-full'}`}>
                {/* Header del panel */}
                <div className={`${onClose ? 'p-3' : 'p-4'} border-b border-gray-100 flex-shrink-0`}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className={`font-semibold text-gray-900 flex items-center space-x-2 ${onClose ? 'text-sm' : ''}`}>
                            <FolderOpen className={`${onClose ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-blue-600`} />
                            <span>Información Capturada</span>
                        </h3>
                        {onClose && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:bg-gray-200 hover:text-foreground"
                                onClick={onClose}
                            >
                                <EyeOff className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                            <span>Progreso general</span>
                            <span>{progress.completed}/{progress.total} pasos</span>
                        </div>
                        <Progress value={progress.percentage} className="h-2" />
                    </div>
                </div>

                {/* Contenido del panel */}
                <div className={`${onClose ? 'h-auto' : 'flex-1 min-h-0 overflow-hidden'}`}>
                    <div className={`${onClose ? 'h-auto' : 'h-full overflow-auto'}`}>
                        <div className={`${onClose ? 'p-3' : 'p-4'} space-y-4`}>
                            {/* PASO 1 – OPERACIÓN Y FORMA DE PAGO */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {getStepStatus('ESTADO_1') === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <CreditCard className="h-4 w-4" />
                                        <span>PASO 1: Operación y Forma de Pago</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.tipoOperacion ? (
                                        <>
                                            <div><span className="font-medium">Tipo de operación:</span> {data.tipoOperacion}</div>
                                            {getStepStatus('ESTADO_1') === 'completed' ? (
                                                data.creditos !== undefined && data.creditos.length > 0 ? (
                                                    <div><span className="font-medium">Forma de pago:</span> Crédito</div>
                                                ) : data.creditos !== undefined && data.creditos.length === 0 ? (
                                                    <div><span className="font-medium">Forma de pago:</span> Contado</div>
                                                ) : (
                                                    <div className="text-gray-400 italic">Forma de pago: Pendiente</div>
                                                )
                                            ) : (
                                                <div className="text-gray-400 italic">Forma de pago: Pendiente</div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-gray-400 italic">Pendiente</div>
                                    )}
                                </div>
                            </div>

                            {/* PASO 2 – INMUEBLE Y REGISTRO (CONSOLIDADO) */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {getStepStatus('ESTADO_2') === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <Building2 className="h-4 w-4" />
                                        <span>PASO 2: Inmueble y Registro</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.inmueble?.folio_real && (
                                        <div><span className="font-medium">Folio Real:</span> {data.inmueble.folio_real}</div>
                                    )}
                                    {data.inmueble?.partidas && data.inmueble.partidas.length > 0 && (
                                        <div><span className="font-medium">Partida(s):</span> {
                                            data.inmueble.partidas
                                                .map((p: any) => {
                                                    if (typeof p === 'string') return p
                                                    if (!p) return null
                                                    return p.partida || p.numero || p.folio || p.value || null
                                                })
                                                .filter(Boolean)
                                                .join(', ')
                                        }</div>
                                    )}
                                    {(() => {
                                        if (hasMultipleUnresolvedFolios) {
                                            return (
                                                <div className="text-gray-400 italic">
                                                    Objeto de compraventa: pendiente hasta confirmar el folio real.
                                                </div>
                                            )
                                        }
                                        const d = data.inmueble?.direccion
                                        const dc = data.inmueble?.datos_catastrales
                                        if (typeof d === 'string' && d.trim()) {
                                            return <div><span className="font-medium">Objeto de compraventa:</span> {d}</div>
                                        }
                                        const conCalle = typeof d === 'object' && d?.calle && `${(d.calle || '').trim()} ${(d.numero || '').trim()} ${(d.colonia || '').trim()}`.trim()
                                        const conColoniaMunicipio = typeof d === 'object' && (d?.colonia || d?.municipio || d?.estado)
                                            ? [d?.calle, d?.numero, d?.colonia, d?.municipio, d?.estado].filter(Boolean).join(', ')
                                            : ''
                                        const datosCat = dc && (dc.unidad || dc.condominio || dc.lote || dc.fraccionamiento || dc.manzana)
                                            ? [
                                                dc.unidad && `Unidad ${dc.unidad}`,
                                                dc.condominio && `Condominio ${dc.condominio}`,
                                                dc.lote && `Lote ${dc.lote}`,
                                                dc.manzana && `Manzana ${dc.manzana}`,
                                                dc.fraccionamiento
                                            ].filter(Boolean).join(' – ')
                                            : ''
                                        const texto = conCalle || conColoniaMunicipio || datosCat
                                            ? (datosCat && (conCalle || conColoniaMunicipio)
                                                ? `${datosCat}, ${conCalle || conColoniaMunicipio}`
                                                : (datosCat || conCalle || conColoniaMunicipio))
                                            : null
                                        return texto ? <div><span className="font-medium">Objeto de compraventa:</span> {texto}</div> : null
                                    })()}
                                    {data.inmueble?.superficie && (
                                        <div><span className="font-medium">Superficie:</span> {
                                            typeof data.inmueble.superficie === 'string'
                                                ? data.inmueble.superficie
                                                : String(data.inmueble.superficie)
                                        }</div>
                                    )}
                                    {data.inmueble?.valor && (
                                        <div><span className="font-medium">Valor:</span> {
                                            typeof data.inmueble.valor === 'string'
                                                ? data.inmueble.valor
                                                : String(data.inmueble.valor)
                                        }</div>
                                    )}
                                    {!data.inmueble?.folio_real && (!data.inmueble?.partidas || data.inmueble.partidas.length === 0) && (
                                        <div className="text-gray-400 italic">Pendiente</div>
                                    )}
                                    {shouldRenderFolioCandidates && (
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowDetectedDetails((prev) => !prev)}
                                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
                                            >
                                                {showDetectedDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                {showDetectedDetails ? 'Ocultar datos detectados' : 'Ver datos detectados'}
                                            </button>
                                            {showDetectedDetails && (
                                                <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 space-y-2">
                                                    {folioCandidates.length > 0 && (
                                                        <div>
                                                            <div className="text-[11px] font-semibold text-blue-900">Folios candidatos</div>
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {folioCandidates.map((folio) => (
                                                                    <button
                                                                        key={folio}
                                                                        type="button"
                                                                        onClick={() => onSelectFolioCandidate?.(folio)}
                                                                        className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10px] text-blue-900 hover:bg-blue-100"
                                                                    >
                                                                        {folio}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PASO 3 – VENDEDOR(ES) */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {sellerStepStatus === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <UserCircle className="h-4 w-4" />
                                        <span>PASO 3: Vendedor(es)</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.vendedores && data.vendedores.length > 0 && (
                                        <>
                                            {data.vendedores[0].persona_fisica?.nombre && (
                                                <div><span className="font-medium">Nombre:</span> {data.vendedores[0].persona_fisica.nombre}</div>
                                            )}
                                            {data.vendedores[0].persona_moral?.denominacion_social && (
                                                <div><span className="font-medium">Denominación Social:</span> {data.vendedores[0].persona_moral.denominacion_social}</div>
                                            )}
                                            {(data.vendedores[0].persona_fisica?.rfc || data.vendedores[0].persona_moral?.rfc) && (
                                                <div><span className="font-medium">RFC:</span> {data.vendedores[0].persona_fisica?.rfc || data.vendedores[0].persona_moral?.rfc}</div>
                                            )}
                                            {data.vendedores[0].persona_fisica?.curp && (
                                                <div><span className="font-medium">CURP:</span> {data.vendedores[0]?.persona_fisica?.curp}</div>
                                            )}
                                            {(() => {
                                                const vendedor = data.vendedores[0]
                                                const tieneCredito = vendedor?.tiene_credito
                                                const hasGravamen =
                                                    data.inmueble?.existe_hipoteca === true ||
                                                    (Array.isArray(data.gravamenes) && data.gravamenes.length > 0)

                                                if (tieneCredito === true) {
                                                    return <div><span className="font-medium">Crédito pendiente:</span> Sí</div>
                                                }
                                                if (tieneCredito === false && !hasGravamen) {
                                                    return <div><span className="font-medium">Crédito pendiente:</span> No</div>
                                                }
                                                if (hasGravamen) {
                                                    return <div><span className="font-medium">Crédito pendiente:</span> Sí (por gravamen/hipoteca)</div>
                                                }
                                                return null
                                            })()}
                                        </>
                                    )}
                                    {(!data.vendedores || data.vendedores.length === 0 || (!data.vendedores[0]?.persona_fisica?.nombre && !data.vendedores[0]?.persona_moral?.denominacion_social)) && (
                                        <div className="text-gray-400 italic">Pendiente</div>
                                    )}
                                </div>
                            </div>

                            {/* PASO 4 – COMPRADOR(ES) */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {getStepStatus('ESTADO_4') === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <Users className="h-4 w-4" />
                                        <span>PASO 4: Comprador(es)</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-1.5 mt-1' : 'space-y-2 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.compradores && data.compradores.length > 0 ? (
                                        data.compradores.map((comprador, idx) => {
                                            const nombre = comprador.persona_fisica?.nombre || comprador.persona_moral?.denominacion_social || null
                                            const rfc = comprador.persona_fisica?.rfc || comprador.persona_moral?.rfc || null
                                            const curp = comprador.persona_fisica?.curp || null

                                            let rolEnCredito: string | null = null
                                            const currentCreditos = data.creditos
                                            if (Array.isArray(currentCreditos) && currentCreditos.length > 0 && nombre) {
                                                for (const credito of currentCreditos) {
                                                    if (!credito.participantes || !Array.isArray(credito.participantes)) continue

                                                    const participante = credito.participantes.find((p: any) => {
                                                        if (p.party_id && comprador.party_id) {
                                                            return p.party_id === comprador.party_id
                                                        }
                                                        if (p.party_id && typeof p.party_id === 'string' && p.party_id.startsWith('comprador_')) {
                                                            const numStr = p.party_id.replace('comprador_', '')
                                                            const num = parseInt(numStr, 10)
                                                            if (!isNaN(num) && num === idx + 1) {
                                                                return true
                                                            }
                                                        }
                                                        if (p.nombre && nombre) {
                                                            const nombreNormalizado = normalizeName(nombre)
                                                            const participanteNombreNormalizado = normalizeName(p.nombre)
                                                            if (nombreNormalizado && participanteNombreNormalizado) {
                                                                return nombreNormalizado === participanteNombreNormalizado ||
                                                                    nombreNormalizado.includes(participanteNombreNormalizado) ||
                                                                    participanteNombreNormalizado.includes(nombreNormalizado)
                                                            }
                                                        }
                                                        return false
                                                    })

                                                    if (participante) {
                                                        rolEnCredito = participante.rol === 'acreditado' ? 'Acreditado' :
                                                            participante.rol === 'coacreditado' ? 'Coacreditado' : null
                                                        break
                                                    }
                                                }
                                            }

                                            if (!nombre) return null

                                            return (
                                                <div key={idx} className="border-l-2 border-blue-200 pl-2 space-y-1">
                                                    <div className="font-semibold text-gray-700">
                                                        {data.compradores.length > 1 ? `Comprador ${idx + 1}` : 'Comprador'}
                                                        {rolEnCredito && ` (${rolEnCredito})`}
                                                    </div>
                                                    {comprador.persona_fisica?.nombre && (
                                                        <div><span className="font-medium">Nombre:</span> {comprador.persona_fisica.nombre}</div>
                                                    )}
                                                    {comprador.persona_moral?.denominacion_social && (
                                                        <div><span className="font-medium">Denominación Social:</span> {comprador.persona_moral.denominacion_social}</div>
                                                    )}
                                                    {rfc && (
                                                        <div><span className="font-medium">RFC:</span> {rfc}</div>
                                                    )}
                                                    {curp && (
                                                        <div><span className="font-medium">CURP:</span> {curp}</div>
                                                    )}
                                                    {comprador.persona_fisica?.estado_civil && (
                                                        <div><span className="font-medium">Estado Civil:</span> {comprador.persona_fisica.estado_civil}</div>
                                                    )}
                                                    {comprador.persona_fisica?.conyuge?.nombre && (
                                                        <div className="text-gray-500 italic">
                                                            <span className="font-medium">Cónyuge:</span> {comprador.persona_fisica.conyuge.nombre}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="text-gray-400 italic">Pendiente (requiere identificación oficial)</div>
                                    )}
                                </div>
                            </div>

                            {uncategorizedPeople.length > 0 && (
                                <div className="pt-1 ml-6">
                                    <button
                                        type="button"
                                        onClick={() => setShowPeopleDetected((prev) => !prev)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-900"
                                    >
                                        {showPeopleDetected ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                        {showPeopleDetected ? 'Ocultar conyuges/personas detectadas' : 'Ver conyuges/personas detectadas'}
                                    </button>
                                    {showPeopleDetected && (
                                        <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 space-y-2">
                                            <div className="text-[11px] font-semibold text-blue-900">Conyuges / personas detectadas</div>
                                            <div className={`${onClose ? 'text-[11px]' : 'text-xs'} text-blue-900`}>Puedes clasificar con click y ajustar el texto antes de enviar.</div>
                                            <div className="space-y-1 pt-1">
                                                {uncategorizedPeople.map((person, idx) => (
                                                    <button
                                                        key={`${normalizeName(person.name)}-${idx}`}
                                                        type="button"
                                                        onClick={() => onSelectUncategorizedPerson?.(person.name)}
                                                        className="w-full text-left rounded border border-blue-300 bg-white px-2 py-1 text-[10px] text-blue-900 hover:bg-blue-100"
                                                    >
                                                        {person.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* PASO 5 – CRÉDITO DEL COMPRADOR */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {getStepStatus('ESTADO_5') === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : getStepStatus('ESTADO_5') === 'blocked' ? (
                                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <CreditCard className="h-4 w-4" />
                                        <span>PASO 5: Crédito del Comprador</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.tipoOperacion ? (
                                        getStepStatus('ESTADO_5') === 'pending' ? (
                                            <div className="text-gray-400 italic">Pendiente: aún no se ha confirmado si será crédito o contado</div>
                                        ) : data.creditos && data.creditos.length > 0 ? (
                                            <>
                                                {data.creditos.map((credito, idx) => {
                                                    const totalCreditos = data.creditos?.length || 0
                                                    return (
                                                        <div key={idx} className="mb-2">
                                                            {credito.institucion && (
                                                                <div><span className="font-medium">Institución {totalCreditos > 1 ? `(${idx + 1})` : ''}:</span> {credito.institucion}</div>
                                                            )}
                                                            {credito.monto && (
                                                                <div><span className="font-medium">Monto {totalCreditos > 1 ? `(${idx + 1})` : ''}:</span> {credito.monto}</div>
                                                            )}
                                                            {!credito.institucion && (
                                                                <div className="text-yellow-600 italic">Información pendiente</div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </>
                                        ) : data.creditos !== undefined && data.creditos.length === 0 ? (
                                            <div className="text-gray-500">No aplica (pago de contado)</div>
                                        ) : (
                                            <div className="text-gray-400 italic">Pendiente: aún no se ha confirmado si será crédito o contado</div>
                                        )
                                    ) : (
                                        <div className="text-gray-400 italic">Pendiente</div>
                                    )}
                                </div>
                            </div>
                            {/* PASO 6 – CANCELACIÓN DE HIPOTECA */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {getStepStatus('ESTADO_6') === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : getStepStatus('ESTADO_6') === 'blocked' ? (
                                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                        <AlertCircle className="h-4 w-4 text-gray-400" />
                                    )}
                                    <h4 className={`font-medium ${onClose ? 'text-[13px]' : 'text-sm'} text-gray-900 flex items-center space-x-1`}>
                                        <FileCheck2 className="h-4 w-4" />
                                        <span>PASO 6: Cancelación de Hipoteca</span>
                                    </h4>
                                </div>
                                <div className={`ml-6 ${onClose ? 'space-y-0.5 mt-1' : 'space-y-1 mt-1.5'} ${onClose ? 'text-[11px]' : 'text-xs'} text-gray-600`}>
                                    {data.inmueble?.existe_hipoteca === false ? (
                                        <div className="text-gray-500">Libre de gravamen/hipoteca (confirmado)</div>
                                    ) : Array.isArray(data.gravamenes) && data.gravamenes.length > 0 ? (
                                        (() => {
                                            const g0: any = data.gravamenes[0]
                                            const acreedor = g0?.institucion ? (
                                                <div className="text-gray-700">Acreedor: {g0.institucion}</div>
                                            ) : null
                                            if (g0?.cancelacion_confirmada === true) {
                                                return (
                                                    <>
                                                        <div className="text-green-700">Existe gravamen/hipoteca: cancelación ya inscrita (confirmado)</div>
                                                        {acreedor}
                                                    </>
                                                )
                                            }
                                            if (g0?.cancelacion_confirmada === false) {
                                                return (
                                                    <>
                                                        <div className="text-green-700">Existe gravamen/hipoteca: se cancelará en la escritura/trámite (confirmado)</div>
                                                        {acreedor}
                                                    </>
                                                )
                                            }
                                            return (
                                                <>
                                                    <div className="text-gray-400 italic">Pendiente: confirmar si la hipoteca se cancelará con esta operación o ya está inscrita la cancelación (sí/no)</div>
                                                    {acreedor}
                                                </>
                                            )
                                        })()
                                    ) : (
                                        <div className="text-gray-400 italic">Pendiente: confirmar si está libre de gravamen/hipoteca (sí/no)</div>
                                    )}
                                </div>
                            </div>

                            {bottomActions && (
                                <div className="pt-3 border-t border-gray-100">
                                    {bottomActions}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}


