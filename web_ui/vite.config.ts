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
          manualChunks: (id) => {
            // 将 node_modules 中的大型库单独打包
            if (id.includes('node_modules')) {
              // Monaco Editor 单独打包（约 2-3MB）
              if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
                return 'monaco-editor';
              }
              // VChart 图表库单独打包（约 1-2MB）
              if (id.includes('@visactor') || id.includes('vchart')) {
                return 'vchart';
              }
              // React 相关库单独打包
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
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
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/static": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
        "/files": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
        "/rss": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
        "/feed": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
        },
        "/api": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
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