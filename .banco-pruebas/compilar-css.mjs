import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const entrada = join(AQUI, 'entrada.css');
const salidaRuta = join(AQUI, 'estilos.css');
const css = readFileSync(entrada, 'utf-8');
const salida = await postcss([tailwind]).process(css, { from: entrada, to: salidaRuta });
writeFileSync(salidaRuta, salida.css);
console.log('CSS compilado:', salida.css.length, 'bytes');
