import ts from 'typescript';
const cfg = ts.readConfigFile('/home/user/atenea/tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, '/home/user/atenea');
const prog = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
const checker = prog.getTypeChecker();
const sf = prog.getSourceFile('/home/user/atenea/.banco-pruebas/formas.ts');
sf.forEachChild(n => {
  if (ts.isTypeAliasDeclaration(n) && n.name.text === 'Desajustadas') {
    const t = checker.getTypeFromTypeNode(n.type);
    console.log(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias));
  }
});
