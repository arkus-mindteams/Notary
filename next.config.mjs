import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['react-pdf'],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;

    // Forzar resolución desde la raíz del proyecto (evita C:\Notary como contexto)
    config.resolve.roots = [path.resolve(__dirname)];

    // Configuración específica para PDF.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
    };

    return config;
  },
  // Configuración de Turbopack
  turbopack: {
    // Usar ruta absoluta del proyecto para evitar resolución en C:\Notary (carpeta padre)
    root: __dirname,
  },
}

export default nextConfig
