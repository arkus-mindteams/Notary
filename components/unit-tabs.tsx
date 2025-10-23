"use client"

import type React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import type { PropertyUnit } from "@/lib/ocr-simulator"

interface UnitTabsProps {
  units: PropertyUnit[]
  activeUnit: string
  onUnitChange: (unitId: string) => void
  children: (unit: PropertyUnit) => React.ReactNode
}

export function UnitTabs({ units, activeUnit, onUnitChange, children }: UnitTabsProps) {
  return (
    <Tabs value={activeUnit} onValueChange={onUnitChange} className="h-full flex flex-col">
      <TabsList className="w-full justify-start overflow-x-auto flex-shrink-0">
        {units.map((unit, index) => (
          <TabsTrigger key={unit.id} value={unit.id} className="gap-2">
            <Badge variant="outline" className="text-xs">
              {index + 1}
            </Badge>
            {unit.name}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex-1 overflow-hidden mt-4">
        {units.map((unit) => (
          <TabsContent key={unit.id} value={unit.id} className="h-full m-0">
            {children(unit)}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}
