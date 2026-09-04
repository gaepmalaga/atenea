/**
 * Imprime, accion por accion, QUE claves promete la de verdad y cuales trae el
 * stub. Es la ayuda de `formas.ts`: ese fichero dice cuales se han desviado,
 * este dice en que.
 */
import ts from 'typescript';
const RAIZ = '/home/user/atenea';
const cfg = ts.readConfigFile(`${RAIZ}/tsconfig.json`, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, RAIZ);
const prog = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const ch = prog.getTypeChecker();

const modulo = (ruta) => {
  const sf = prog.getSourceFile(ruta);
  const sym = ch.getSymbolAtLocation(sf);
  return new Map(ch.getExportsOfModule(sym).map((s) => [s.getName(), s]));
};

const claves = (sym) => {
  const t = ch.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration ?? sym.declarations[0]);
  const firma = t.getCallSignatures()[0];
  if (!firma) return null;
  let ret = firma.getReturnType();
  ret = ch.getAwaitedType?.(ret) ?? ret;
  const ramas = ret.isUnion() ? ret.types : [ret];
  const exito = ramas.filter((r) => {
    const p = r.getProperty('success');
    if (!p) return false;
    const tp = ch.getTypeOfSymbolAtLocation(p, p.valueDeclaration ?? p.declarations?.[0] ?? sym.valueDeclaration);
    return tp.flags & ts.TypeFlags.BooleanLiteral ? ch.typeToString(tp) === 'true' : false;
  });
  if (exito.length === 0) return null;
  // Las OPCIONALES no cuentan: casi todas las acciones declaran `error?:
  // string` tambien en la rama buena, y ninguna pantalla depende de que el
  // stub la traiga.
  return [...new Set(
    exito.flatMap((r) => r.getProperties().filter((p) => !(p.flags & ts.SymbolFlags.Optional)).map((p) => p.getName())),
  )].sort();
};

const reales = modulo(`${RAIZ}/app/actions/index.ts`);
const falsas = modulo(`${RAIZ}/.banco-pruebas/acciones-falsas.ts`);

let malas = 0;
for (const [nombre, symR] of reales) {
  // Solo las FUNCIONES: el barril exporta tambien tipos, que no se sustituyen.
  const tipoR = ch.getTypeOfSymbolAtLocation(symR, symR.valueDeclaration ?? symR.declarations?.[0]);
  if (!tipoR || tipoR.getCallSignatures().length === 0) continue;
  const symF = falsas.get(nombre);
  if (!symF) { console.log(`✗ ${nombre}: NO existe en el banco de pruebas`); malas++; continue; }
  const r = claves(symR);
  const f = claves(symF);
  if (!r || !f) continue;
  const faltan = r.filter((k) => !f.includes(k));
  if (faltan.length) {
    console.log(`✗ ${nombre}\n    de verdad: ${r.join(', ')}\n    el stub:   ${f.join(', ')}\n    FALTAN:    ${faltan.join(', ')}`);
    malas++;
  }
}
console.log(malas === 0 ? '\nTodos los stubs tienen la forma de su acción.' : `\n${malas} stubs desviados.`);
