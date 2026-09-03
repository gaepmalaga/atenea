import * as esbuild from 'esbuild';
const R = '/home/user/atenea';
await esbuild.build({
  entryPoints: [`${R}/.banco-pruebas/entrada.tsx`],
  bundle: true, outfile: `${R}/.banco-pruebas/app.js`,
  jsx: 'automatic', format: 'iife', logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  alias: {
    // Las Server Actions, sustituidas por datos de prueba
    '@/actions': `${R}/.banco-pruebas/acciones-falsas.ts`,
    '@': R,
  },
});
