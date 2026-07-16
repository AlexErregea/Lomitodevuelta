import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Los paquetes internos se consumen como TypeScript fuente (sin build
  // propio): Next los transpila al vuelo. Ver ADR-0001.
  transpilePackages: ['@lomito/shared', '@lomito/matching'],
};

export default nextConfig;
