import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command, mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react({
        jsxRuntime: 'automatic',
      })
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    // 基础路径配置
    base: command === "serve" ? "/" : "/",
    // 开发服务器配置
    // 构建配置
    build: {
      outDir: "dist",
      emptyOutDir: true,
      assetsDir: "assets",
      // 启用代码分割和压缩
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // 代码分割配置：将大型库单独打包
          // 注意：顺序很重要，React 相关库必须最先处理，确保依赖关系正确
          manualChunks: (id) => {
            // 将 node_modules 中的大型库单独打包
            if (id.includes('node_modules')) {
              // React 相关库单独打包（必须最先处理，确保其他库可以依赖它）
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }
              // Monaco Editor 单独打包（约 2-3MB）
              if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
                return 'monaco-editor';
              }
              // VChart 图表库单独打包（约 1-2MB）
              if (id.includes('@visactor') || id.includes('vchart')) {
                return 'vchart';
              }
              // Radix UI 组件库单独打包
              if (id.includes('@radix-ui')) {
                return 'radix-ui';
              }
              // 其他第三方库
              return 'vendor';
            }
          },
          // 优化 chunk 文件命名
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
        // 确保模块依赖关系正确
        external: [],
        // 优化模块解析顺序
        preserveEntrySignatures: 'strict',
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/static": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              // 静默处理代理错误，避免中断开发服务器
              // 只在非连接错误时显示（连接错误通常是后端服务器未启动）
              if (err.code !== 'ECONNREFUSED') {
                console.log(`[vite] proxy error: ${err.message}`);
              }
              // 对于连接错误，返回 404 而不是抛出异常
              if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Backend server not available');
              }
            });
          },
        },
        "/files": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              if (err.code !== 'ECONNREFUSED') {
                console.log(`[vite] proxy error: ${err.message}`);
              }
              if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Backend server not available');
              }
            });
          },
        },
        "/rss": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              if (err.code !== 'ECONNREFUSED') {
                console.log(`[vite] proxy error: ${err.message}`);
              }
              if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Backend server not available');
              }
            });
          },
        },
        "/feed": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              if (err.code !== 'ECONNREFUSED') {
                console.log(`[vite] proxy error: ${err.message}`);
              }
              if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Backend server not available');
              }
            });
          },
        },
        "/api": {
          target: env.VITE_API_BASE_URL || "http://127.0.0.1:8001",
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              if (err.code !== 'ECONNREFUSED') {
                console.log(`[vite] proxy error: ${err.message}`);
              }
              if (err.code === 'ECONNREFUSED' && res && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Backend server not available');
              }
            });
          },
        },
        "/test-results": {
          target: "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/test-results/, '/test-results'),
        },
      },
    },
  };
});