export type StructuredUnit = {
  unit: { name: string; model?: string }
  boundaries: Array<{
    direction: "WEST" | "NORTHWEST" | "NORTH" | "NORTHEAST" | "EAST" | "SOUTHEAST" | "SOUTH" | "SOUTHWEST" | string
    length_m: number
    abutter: string
    order_index: number
  }>
  surfaces: Array<{ name: string; value_m2: number }>
  anomalies?: string[]
}

export type StructuringRequest = {
  ocrText: string
  hints?: { language?: "es" | "en"; unitNameHint?: string }
}

export type StructuringResponse = { result: StructuredUnit }


