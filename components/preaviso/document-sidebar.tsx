"use client"

import {
    CheckCircle2,
    AlertCircle,
    CreditCard,
    Building2,
    UserCircle,
    Users,
    FileCheck2,
    FolderOpen,
    EyeOff
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
}

export function DocumentSidebar({ data, serverState, isVisible, onClose }: DocumentSidebarProps) {
    if (!isVisible) return null

    // Calcular progreso
    const progress = (() => {
        if (!serverState?.state_status) return { completed: 0, total: 6, percentage: 0 }
        const statuses = Object.values(serverState.state_status)
        const completed = statuses.filter(s => s === 'completed' || s === 'not_applicable').length
        const total = 6
        return {
            completed,
            total,
            percentage: (completed / total) * 100
        }
    })()

    // Función auxiliar para normalizar nombres
    const normalizeName = (str: string | null | undefined): string => {
        if (!str) return ''
        return str.toLowerCase().trim().replace(/\s+/g, ' ')
    }

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
                                    {serverState?.state_status?.ESTADO_1 === 'completed' ? (
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
                                            {serverState?.state_status?.ESTADO_1 === 'completed' ? (
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
                                    {serverState?.state_status?.ESTADO_2 === 'completed' ? (
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
                                    {data.inmueble?.direccion?.calle && (
                                        <div><span className="font-medium">Dirección:</span> {
                                            typeof data.inmueble.direccion === 'string'
                                                ? data.inmueble.direccion
                                                : (() => {
                                                    const unidad = data.inmueble?.datos_catastrales?.unidad
                                                    const base = `${data.inmueble.direccion.calle || ''} ${data.inmueble.direccion.numero || ''} ${data.inmueble.direccion.colonia || ''}`.trim()
                                                    return unidad ? `Unidad ${unidad}, ${base}` : base
                                                })()
                                        }</div>
                                    )}
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
                                </div>
                            </div>

                            {/* PASO 3 – VENDEDOR(ES) */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {serverState?.state_status?.ESTADO_3 === 'completed' ? (
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
                                    {serverState?.state_status?.ESTADO_4 === 'completed' ? (
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

                            {/* PASO 5 – CRÉDITO DEL COMPRADOR */}
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                    {serverState?.state_status?.ESTADO_5 === 'completed' || serverState?.state_status?.ESTADO_5 === 'not_applicable' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : serverState?.state_status?.ESTADO_5 === 'incomplete' ? (
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
                                        serverState?.state_status?.ESTADO_5 === 'pending' ? (
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
                                    {serverState?.state_status?.ESTADO_6 === 'completed' || serverState?.state_status?.ESTADO_6 === 'not_applicable' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : serverState?.state_status?.ESTADO_6 === 'incomplete' ? (
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
                                                    <div className="text-gray-400 italic">Pendiente: confirmar si la cancelación ya está inscrita (sí/no)</div>
                                                    {acreedor}
                                                </>
                                            )
                                        })()
                                    ) : (
                                        <div className="text-gray-400 italic">Pendiente: confirmar si está libre de gravamen/hipoteca (sí/no)</div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
