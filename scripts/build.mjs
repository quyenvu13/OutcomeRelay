import { build } from 'esbuild'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })
await mkdir('dist/assets', { recursive: true })
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, sourcemap: false, format: 'esm', target: ['es2022'], outfile: 'dist/assets/main.js' })
await cp('src/styles.css', 'dist/assets/styles.css')
await cp('OutcomeRelay-logo.svg', 'dist/OutcomeRelay-logo.svg')
await cp('favicon.svg', 'dist/favicon.svg')
await cp('vercel.json', 'dist/vercel.json')
await writeFile('dist/index.html', await readFile('index.html', 'utf8'))
console.log('OutcomeRelay production build created in dist/.')
