import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFileSync, writeFileSync } from 'node:fs';

const entrada = '/home/user/atenea/.banco-pruebas/entrada.css';
const css = readFileSync(entrada, 'utf-8');
const salida = await postcss([tailwind]).process(css, { from: entrada, to: '/home/user/atenea/.banco-pruebas/estilos.css' });
writeFileSync('/home/user/atenea/.banco-pruebas/estilos.css', salida.css);
console.log('CSS compilado:', salida.css.length, 'bytes');
