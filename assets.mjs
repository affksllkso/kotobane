import { cp, mkdir } from 'node:fs/promises';

await mkdir('public/pdf', { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${directory}`, `public/pdf/${directory}`, { recursive: true });
}
