/**
 * SONDA de las dos fuentes de normativa (BOE y Cellar de la UE). Solo lee y
 * enseña la forma de cada respuesta: sirve para escribir el vigilante contra
 * lo que devuelven de verdad y no contra lo que dice la memoria.
 *
 *   node scripts/operacion/sondear-fuentes.mjs
 *
 * No toca la base de datos ni necesita claves.
 */

const UA = { 'User-Agent': 'Alphapol-Campus/1.0 (vigilancia de normativa del temario)' };
const BOE = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada';

async function ver(titulo, url, accept, recorte = 2500) {
  console.log(`\n===== ${titulo}\n${url}`);
  try {
    const res = await fetch(url, { headers: { ...UA, Accept: accept } });
    const texto = await res.text();
    console.log(`HTTP ${res.status} · ${res.headers.get('content-type')} · ${texto.length} bytes`);
    console.log(texto.slice(0, recorte));
    return texto;
  } catch (e) {
    console.log('FALLO:', e instanceof Error ? e.message : e);
    return '';
  }
}

const LEY40 = 'BOE-A-2015-10566';
await ver('metadatos', `${BOE}/id/${LEY40}/metadatos`, 'application/json', 4000);
await ver('indice (json)', `${BOE}/id/${LEY40}/texto/indice`, 'application/json', 3000);
await ver('indice (xml)', `${BOE}/id/${LEY40}/texto/indice`, 'application/xml', 3000);
await ver('bloque a69 (xml)', `${BOE}/id/${LEY40}/texto/bloque/a69`, 'application/xml', 4000);
await ver('analisis', `${BOE}/id/${LEY40}/analisis`, 'application/json', 4000);
await ver('lista actualizadas desde el 1-11-2026', `${BOE}?from=20261101&to=20261119&limit=3`, 'application/json', 3000);
const q = encodeURIComponent(JSON.stringify({ query: { query_string: { query: 'numero_oficial:1155/2024' } } }));
await ver('busqueda por numero oficial', `${BOE}?query=${q}&limit=3`, 'application/json', 3000);
// Una norma derogada, para ver cómo lo dice: el RD 557/2011 (antiguo Reglamento de extranjería).
await ver('busqueda RD 557/2011', `${BOE}?query=${encodeURIComponent(JSON.stringify({ query: { query_string: { query: 'numero_oficial:557/2011' } } }))}&limit=3`, 'application/json', 3000);

// El texto entero en XML: atributos de las versiones de los tres primeros bloques y del 69.
const xml = await ver('texto (xml), cabecera', `${BOE}/id/${LEY40}/texto`, 'application/xml', 600);
if (xml) {
  const bloques = [...xml.matchAll(/<bloque ([^>]*)>([\s\S]*?)<\/bloque>/g)];
  console.log(`bloques: ${bloques.length}`);
  for (const b of [...bloques.slice(0, 3), ...bloques.filter((x) => /id="a69"|id="a8ter"|id="da11"|id="da-11"/.test(x[1]))]) {
    console.log('BLOQUE', b[1], '→ versiones:', [...b[2].matchAll(/<version ([^>]*)>/g)].map((v) => v[1]).join(' | '));
  }
  const ids = bloques.map((b) => /id="([^"]+)"/.exec(b[1])?.[1]);
  console.log('ids de muestra:', ids.slice(0, 15).join(', '), '…', ids.slice(-25).join(', '));
}

// ---- Cellar (Oficina de Publicaciones de la UE) ----
const SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql';
async function sparql(titulo, consulta) {
  const url = `${SPARQL}?query=${encodeURIComponent(consulta)}&format=${encodeURIComponent('application/sparql-results+json')}`;
  return ver(titulo, url, 'application/sparql-results+json', 6000);
}
const CDM = 'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>';
await sparql('cellar: propiedades del RGPD (32016R0679)', `${CDM} SELECT ?p ?o WHERE { ?w cdm:resource_legal_id_celex "32016R0679"^^xsd:string . ?w ?p ?o . FILTER(!isLiteral(?o) || STRLEN(STR(?o)) < 80) } LIMIT 120`);
await sparql('cellar: lo que apunta al RGPD', `${CDM} SELECT ?p (COUNT(?x) AS ?n) WHERE { ?w cdm:resource_legal_id_celex "32016R0679"^^xsd:string . ?x ?p ?w } GROUP BY ?p LIMIT 60`);
await sparql('cellar: actos que modifican el Código de fronteras Schengen (32016R0399)', `${CDM} SELECT ?celex ?fecha WHERE { ?w cdm:resource_legal_id_celex "32016R0399"^^xsd:string . ?x cdm:resource_legal_amends_resource_legal ?w . ?x cdm:resource_legal_id_celex ?celex . OPTIONAL { ?x cdm:work_date_document ?fecha } } ORDER BY DESC(?fecha) LIMIT 20`);
await sparql('cellar: versiones consolidadas del Código de fronteras', `${CDM} SELECT ?celex ?fecha WHERE { ?w cdm:resource_legal_id_celex "32016R0399"^^xsd:string . ?c cdm:act_consolidated_consolidates_resource_legal ?w . ?c cdm:resource_legal_id_celex ?celex . OPTIONAL { ?c cdm:work_date_document ?fecha } } ORDER BY DESC(?fecha) LIMIT 10`);
