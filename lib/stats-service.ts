import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const STATS_DIR = join(process.cwd(), 'data')
const STATS_FILE = join(STATS_DIR, 'stats.json')

interface Stats {
    plantas_arquitectonicas_procesadas: number
    last_updated: string
}

const DEFAULT_STATS: Stats = {
    plantas_arquitectonicas_procesadas: 0,
    last_updated: new Date().toISOString()
}

/**
 * Servicio provisional para manejar estadísticas en archivos JSON locales
 * (Usado en branch main mientras se integra DB completa)
 */
export class StatsService {
    private static ensureDir() {
        if (!existsSync(STATS_DIR)) {
            mkdirSync(STATS_DIR, { recursive: true })
        }
    }

    static getStats(): Stats {
        this.ensureDir()
        if (!existsSync(STATS_FILE)) {
            this.saveStats(DEFAULT_STATS)
            return DEFAULT_STATS
        }

        try {
            const content = readFileSync(STATS_FILE, 'utf-8')
            return JSON.parse(content)
        } catch (error) {
            console.error('[StatsService] Error reading stats:', error)
            return DEFAULT_STATS
        }
    }

    static saveStats(stats: Stats) {
        this.ensureDir()
        try {
            writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8')
        } catch (error) {
            console.error('[StatsService] Error saving stats:', error)
        }
    }

    /**
     * Incrementa el contador de planos procesados
     */
    static incrementPlantasProcesadas(): number {
        const stats = this.getStats()
        stats.plantas_arquitectonicas_procesadas += 1
        stats.last_updated = new Date().toISOString()
        this.saveStats(stats)
        return stats.plantas_arquitectonicas_procesadas
    }
}
