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
    
    // Configuración específica para PDF.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
    };
    
    return config;
  },
  // Configuración de Turbopack vacía para silenciar el error cuando se usa Turbopack
  // La funcionalidad de PDFs funciona en el cliente, así que esta config no afecta la conversión
  turbopack: {},
}

export default nextConfig
