export interface BoundarySegment {
  id: string
  measurement: string
  unit: string
  description: string
  regionId: string
}

export interface PropertyUnit {
  id: string
  name: string
  surface: string
  boundaries: {
    north: BoundarySegment[]
    south: BoundarySegment[]
    east: BoundarySegment[]
    west: BoundarySegment[]
  }
}

export interface OCRResult {
  success: boolean
  extractedData: {
    units: PropertyUnit[]
  }
  confidence: number
}

export async function simulateOCR(file: File): Promise<OCRResult> {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return {
    success: true,
    extractedData: {
      units: [
        {
          id: "unit-b2",
          name: "UNIDAD B-2",
          surface: "55.980 m2",
          boundaries: {
            west: [
              {
                id: "unit-b2-west-1",
                measurement: "6.750",
                unit: "MTS",
                description: "CON UNIDAD B-4",
                regionId: "unit-b2-west-1",
              },
              {
                id: "unit-b2-west-2",
                measurement: "1.750",
                unit: "MTS",
                description: "CON CUBO DE ILUMINACION",
                regionId: "unit-b2-west-2",
              },
            ],
            north: [
              {
                id: "unit-b2-north-1",
                measurement: "2.550",
                unit: "MTS",
                description: "CON CUBO DE ILUMINACION",
                regionId: "unit-b2-north-1",
              },
              {
                id: "unit-b2-north-2",
                measurement: "4.720",
                unit: "MTS",
                description: "CON JUNTA CONSTRUCTIVA 1",
                regionId: "unit-b2-north-2",
              },
            ],
            east: [
              {
                id: "unit-b2-east-1",
                measurement: "0.520",
                unit: "MTS",
                description: "CON AREA COMUN DE SERVICIO 7 DE EDIFICIO B (ACS-7 DE E-B)",
                regionId: "unit-b2-east-1",
              },
              {
                id: "unit-b2-east-2",
                measurement: "3.480",
                unit: "MTS",
                description: "CON AREA COMUN (AC-12)",
                regionId: "unit-b2-east-2",
              },
              {
                id: "unit-b2-east-3",
                measurement: "4.500",
                unit: "MTS",
                description: "CON AREA COMUN (AC-12)",
                regionId: "unit-b2-east-3",
              },
            ],
            south: [
              {
                id: "unit-b2-south-1",
                measurement: "0.300",
                unit: "MTS",
                description: "CON AREA COMUN (AC-12)",
                regionId: "unit-b2-south-1",
              },
              {
                id: "unit-b2-south-2",
                measurement: "5.370",
                unit: "MTS",
                description: "CON AREA COMUN 1.1 DE EDIFICIO B EN PLANTA BAJA (AC1.1EB-PB)",
                regionId: "unit-b2-south-2",
              },
              {
                id: "unit-b2-south-3",
                measurement: "1.600",
                unit: "MTS",
                description: "CON AREA COMUN 1 DE EDIFICIO B EN PLANTA BAJA (AC1EB-PB)",
                regionId: "unit-b2-south-3",
              },
            ],
          },
        },
        {
          id: "cubo-iluminacion",
          name: "CUBO DE ILUMINACION",
          surface: "4.463 m2",
          boundaries: {
            west: [
              {
                id: "cubo-west-1",
                measurement: "1.750",
                unit: "MTS",
                description: "CON UNIDAD B-4",
                regionId: "cubo-west-1",
              },
            ],
            north: [
              {
                id: "cubo-north-1",
                measurement: "2.550",
                unit: "MTS",
                description: "CON JUNTA CONSTRUCTIVA 2",
                regionId: "cubo-north-1",
              },
            ],
            east: [
              {
                id: "cubo-east-1",
                measurement: "1.750",
                unit: "MTS",
                description: "CON UNIDAD B-2",
                regionId: "cubo-east-1",
              },
            ],
            south: [
              {
                id: "cubo-south-1",
                measurement: "2.550",
                unit: "MTS",
                description: "CON UNIDAD B-2",
                regionId: "cubo-south-1",
              },
            ],
          },
        },
        {
          id: "junta-constructiva-1",
          name: "JUNTA CONSTRUCTIVA 1",
          surface: "0.118 m2",
          boundaries: {
            west: [
              {
                id: "jc1-west-1",
                measurement: "0.025",
                unit: "MTS",
                description: "CON JUNTA CONSTRUCTIVA 2",
                regionId: "jc1-west-1",
              },
            ],
            north: [
              {
                id: "jc1-north-1",
                measurement: "4.720",
                unit: "MTS",
                description: "CON UNIDAD C-1",
                regionId: "jc1-north-1",
              },
            ],
            east: [
              {
                id: "jc1-east-1",
                measurement: "0.025",
                unit: "MTS",
                description: "CON AREA COMUN DE SERVICIO 7 DE EDIFICIO B (ACS-7 DE E-B)",
                regionId: "jc1-east-1",
              },
            ],
            south: [
              {
                id: "jc1-south-1",
                measurement: "4.720",
                unit: "MTS",
                description: "CON UNIDAD B-2",
                regionId: "jc1-south-1",
              },
            ],
          },
        },
        {
          id: "junta-constructiva-2",
          name: "JUNTA CONSTRUCTIVA 2",
          surface: "0.064 m2",
          boundaries: {
            west: [
              {
                id: "jc2-west-1",
                measurement: "0.025",
                unit: "MTS",
                description: "CON UNIDAD B-4",
                regionId: "jc2-west-1",
              },
            ],
            north: [
              {
                id: "jc2-north-1",
                measurement: "2.550",
                unit: "MTS",
                description: "CON UNIDAD C-1",
                regionId: "jc2-north-1",
              },
            ],
            east: [
              {
                id: "jc2-east-1",
                measurement: "0.025",
                unit: "MTS",
                description: "CON JUNTA CONSTRUCTIVA 1",
                regionId: "jc2-east-1",
              },
            ],
            south: [
              {
                id: "jc2-south-1",
                measurement: "2.550",
                unit: "MTS",
                description: "CON CUBO DE ILUMINACION",
                regionId: "jc2-south-1",
              },
            ],
          },
        },
        {
          id: "cajon-estacionamiento",
          name: "CAJON DE ESTACIONAMIENTO",
          surface: "14.310 m2",
          boundaries: {
            west: [
              {
                id: "cajon-west-1",
                measurement: "2.650",
                unit: "MTS",
                description: "CON AREA COMUN (AC-12)",
                regionId: "cajon-west-1",
              },
            ],
            north: [
              {
                id: "cajon-north-1",
                measurement: "5.400",
                unit: "MTS",
                description: "CON AREA COMUN (AC-12)",
                regionId: "cajon-north-1",
              },
            ],
            east: [
              {
                id: "cajon-east-1",
                measurement: "2.650",
                unit: "MTS",
                description: "CON AREA COMUN (AC-9)",
                regionId: "cajon-east-1",
              },
            ],
            south: [
              {
                id: "cajon-south-1",
                measurement: "5.400",
                unit: "MTS",
                description: "CON EST_B-4",
                regionId: "cajon-south-1",
              },
            ],
          },
        },
      ],
    },
    confidence: 0.95,
  }
}
