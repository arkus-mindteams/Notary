/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['react-pdf', 'pdfjs-dist'],
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    
    // Configuración específica para PDF.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
    };

    // Prevent webpack from parsing pdfjs-dist to avoid transformation issues
    if (!isServer) {
      // Tell webpack to not parse pdfjs-dist - it has its own module system
      // This prevents Object.defineProperty errors during module processing
      config.module = config.module || {};
      config.module.noParse = config.module.noParse || [];
      config.module.noParse.push(/pdfjs-dist/);
    }
    
    return config;
  },
  
  // Turbopack configuration (default in Next.js 16)
  // Empty config to silence the warning - we need webpack for pdfjs-dist noParse
  // To use webpack explicitly: npm run build -- --webpack or npm run dev -- --webpack
  turbopack: {},
}

export default nextConfig
