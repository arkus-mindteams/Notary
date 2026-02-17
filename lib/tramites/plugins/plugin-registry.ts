import type { TramitePlugin, TramiteType } from '@/lib/tramites/plugins/tramite-plugin'
import { PreavisoTramitePlugin } from '@/lib/tramites/plugins/preaviso-tramite-plugin'
import { PreventivoTramitePlugin } from '@/lib/tramites/plugins/preventivo-tramite-plugin'

export class PluginRegistry {
  private readonly plugins = new Map<string, TramitePlugin>()
  private static instance: PluginRegistry | null = null

  static getInstance(): PluginRegistry {
    if (!this.instance) {
      const registry = new PluginRegistry()
      registry.register(new PreavisoTramitePlugin())
      registry.register(new PreventivoTramitePlugin())
      this.instance = registry
    }
    return this.instance
  }

  register(plugin: TramitePlugin): void {
    this.plugins.set(plugin.tramiteType, plugin)
  }

  get(tramiteType: TramiteType | string): TramitePlugin {
    const key = String(tramiteType || '').trim()
    const plugin = this.plugins.get(key)
    if (!plugin) {
      throw new Error(`No plugin registered for tramiteType=${key || '(empty)'}`)
    }
    return plugin
  }

  list(): string[] {
    return Array.from(this.plugins.keys()).sort()
  }
}
