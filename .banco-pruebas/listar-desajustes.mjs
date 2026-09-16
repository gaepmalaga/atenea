import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = ts.readConfigFile(`${RAIZ}/tsconfig.json`, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, RAIZ);
const prog = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = prog.getTypeChecker();
const sf = prog.getSourceFile(`${RAIZ}/.banco-pruebas/formas.ts`);
sf.forEachChild(n => {
  if (ts.isTypeAliasDeclaration(n) && n.name.text === 'Desajustadas') {
    const t = checker.getTypeFromTypeNode(n.type);
    console.log(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));
  }
});
