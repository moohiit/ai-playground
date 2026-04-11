/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  outputFileTracingIncludes: {
    "/api/projects/sql-generator/execute": [
      "./node_modules/sql.js/dist/sql-wasm.wasm",
    ],
  },
};

export default nextConfig;
