import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Especificar el directorio raíz del proyecto para evitar confusión con otros lockfiles
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['react-pdf'],
  // Turbopack config (empty for now, webpack config below)
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Configuración específica para PDF.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
    };
    
    return config;
  },
}

export default nextConfig
