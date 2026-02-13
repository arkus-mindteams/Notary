"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'notario' | 'abogado' | 'asistente'
export type PreavisoType = 'compraventa' | 'adjudicacion' | 'donacion' | 'mutuo' | 'permuta'

interface MockContextType {
    role: UserRole
    setRole: (role: UserRole) => void
    preavisoType: PreavisoType
    setPreavisoType: (type: PreavisoType) => void
    completedStages: string[]
    setCompletedStages: (stages: string[]) => void
    extractedData: any
    setExtractedData: (data: any) => void
}

const MockContext = createContext<MockContextType | undefined>(undefined)

export function MockProvider({ children }: { children: React.ReactNode }) {
    const [role, setRole] = useState<UserRole>('notario')
    const [preavisoType, setPreavisoType] = useState<PreavisoType>('compraventa')
    const [completedStages, setCompletedStages] = useState<string[]>([])
    const [extractedData, setExtractedData] = useState<any>({})

    // Load from localStorage if available
    useEffect(() => {
        const savedRole = localStorage.getItem('mock-role') as UserRole
        const savedType = localStorage.getItem('mock-preaviso-type') as PreavisoType
        const savedStages = localStorage.getItem('mock-completed-stages')
        const savedData = localStorage.getItem('mock-extracted-data')

        if (savedRole) setRole(savedRole)
        if (savedType) setPreavisoType(savedType)
        if (savedStages) setCompletedStages(JSON.parse(savedStages))
        if (savedData) setExtractedData(JSON.parse(savedData))
    }, [])

    const updateRole = (newRole: UserRole) => {
        setRole(newRole)
        localStorage.setItem('mock-role', newRole)
    }

    const updatePreavisoType = (newType: PreavisoType) => {
        setPreavisoType(newType)
        localStorage.setItem('mock-preaviso-type', newType)
    }

    const updateCompletedStages = (stages: string[]) => {
        setCompletedStages(stages)
        localStorage.setItem('mock-completed-stages', JSON.stringify(stages))
    }

    const updateExtractedData = (data: any) => {
        setExtractedData(data)
        localStorage.setItem('mock-extracted-data', JSON.stringify(data))
    }

    return (
        <MockContext.Provider value={{
            role,
            setRole: updateRole,
            preavisoType,
            setPreavisoType: updatePreavisoType,
            completedStages,
            setCompletedStages: updateCompletedStages,
            extractedData,
            setExtractedData: updateExtractedData
        }}>
            {children}
        </MockContext.Provider>
    )
}

export function useMock() {
    const context = useContext(MockContext)
    if (context === undefined) {
        throw new Error('useMock must be used within a MockProvider')
    }
    return context
}
