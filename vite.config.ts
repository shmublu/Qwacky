import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

const BROWSER_CONFIG = {
  chrome:  { outDir: 'dist_chrome',  manifest: 'manifest.chrome.json',  includePolyfill: true  },
  firefox: { outDir: 'dist_firefox', manifest: 'manifest.firefox.json', includePolyfill: true  },
  safari:  { outDir: 'dist_safari',  manifest: 'manifest.safari.json',  includePolyfill: false },
} as const

type BrowserTarget = keyof typeof BROWSER_CONFIG

const copyManifest = (target: BrowserTarget) => ({
  name: 'copy-manifest',
  writeBundle: () => {
    const { outDir, manifest, includePolyfill } = BROWSER_CONFIG[target]

    mkdirSync(`${outDir}/assets/icons`, { recursive: true })

    const manifestContent = readFileSync(manifest, 'utf-8')
    const finalManifest = process.env.RELEASE === 'true'
      ? manifestContent.replace('qwacky@local-v1.0.1', 'qwacky@store-v1.0.1')
      : manifestContent
    writeFileSync(`${outDir}/manifest.json`, finalManifest)

    for (const size of ['16', '48', '128']) {
      copyFileSync(`assets/icons/qwacky-${size}.png`, `${outDir}/assets/icons/qwacky-${size}.png`)
    }
    copyFileSync('assets/icons/qwacky.png', `${outDir}/assets/icons/qwacky.png`)

    if (includePolyfill) {
      const polyfillPath = 'node_modules/webextension-polyfill/dist/browser-polyfill.js'
      if (existsSync(polyfillPath)) {
        copyFileSync(polyfillPath, `${outDir}/browser-polyfill.js`)
      }
    }

    copyFileSync('CHANGELOG.md', `${outDir}/CHANGELOG.md`)
  },
})

const FIXED_NAME_ENTRIES = new Set(['background', 'contentScript', 'bypassExtensionRequirement', 'ddgEmailAuth'])

export default defineConfig(({ mode }) => {
  const target: BrowserTarget = (mode in BROWSER_CONFIG ? mode : 'chrome') as BrowserTarget
  const { outDir } = BROWSER_CONFIG[target]

  return {
    plugins: [react(), copyManifest(target)],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'process.env.BROWSER': JSON.stringify(target),
    },
    build: {
      outDir,
      sourcemap: false,
      emptyOutDir: true,
      target: target === 'safari' ? 'safari17' : 'es2020',
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'index.html'),
          background: resolve(__dirname, 'src/background.ts'),
          contentScript: resolve(__dirname, 'src/contentScript.ts'),
          bypassExtensionRequirement: resolve(__dirname, 'src/bypassExtensionRequirement.ts'),
          ddgEmailAuth: resolve(__dirname, 'src/ddgEmailAuth.ts')
        },
        output: {
          format: 'esm',
          entryFileNames: chunk => FIXED_NAME_ENTRIES.has(chunk.name) ? '[name].js' : 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]'
        }
      }
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})