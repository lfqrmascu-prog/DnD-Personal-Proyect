// scripts/filter.js
// Uso: node scripts/filter.js data/raw data/official

const fs = require("fs");
const path = require("path");

const BLOCK_PATTERNS = [
  /ua/i,                      // Unearthed Arcana
  /unearthed\s*arcana/i,
  /play\s*test/i,             // playtest
  /playtest/i,
  /home\s*brew/i,
  /homebrew/i,
  /brew/i
];

function looksBlockedSource(val) {
  if (!val) return false;
  const s = String(val);
  return BLOCK_PATTERNS.some((re) => re.test(s));
}

function filterEntry(obj) {
  if (obj && typeof obj === "object") {
    // Si la propia entrada está marcada con un "source" bloqueado, descártala
    if (looksBlockedSource(obj.source)) return false;
    // Algunas entradas llevan "srd": true/false (si existiera, no forcemos; dejamos oficial).
    // Limpieza recursiva de arrays internas
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (Array.isArray(v)) {
        obj[k] = v
          .map((it) => (typeof it === "object" ? deepFilter(it) : it))
          .filter((it) => (typeof it === "object" ? it !== null : true));
      } else if (typeof v === "object" && v !== null) {
        obj[k] = deepFilter(v);
      }
    }
  }
  return true;
}

function deepFilter(node) {
  if (Array.isArray(node)) {
    return node
      .map((it) => (typeof it === "object" ? deepFilter(it) : it))
      .filter((it) => (typeof it === "object" ? it !== null : true));
  } else if (node && typeof node === "object") {
    // Si esta entrada como objeto tiene "source" bloqueado, elimina el objeto completo
    if (looksBlockedSource(node.source)) return null;
    // Recorre propiedades
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) {
        node[k] = v
          .map((it) => (typeof it === "object" ? deepFilter(it) : it))
          .filter((it) => (typeof it === "object" ? it !== null : true));
      } else if (typeof v === "object" && v !== null) {
        node[k] = deepFilter(v);
        if (node[k] === null) delete node[k];
      }
    }
    return node;
  }
  return node;
}

function processFile(inFile, outFile) {
  try {
    const raw = fs.readFileSync(inFile, "utf8");
    const json = JSON.parse(raw);
    let changed = false;

    // Filtra a nivel raíz: si una propiedad es lista, filtramos sus entradas
    for (const key of Object.keys(json)) {
      const val = json[key];
      if (Array.isArray(val)) {
        const filtered = val
          .map((entry) => (typeof entry === "object" ? deepFilter(entry) : entry))
          .filter((entry) => (typeof entry === "object" ? entry !== null && filterEntry(entry) : true));
        if (filtered.length !== val.length) changed = true;
        json[key] = filtered;
      } else if (typeof val === "object" && val !== null) {
        const filteredObj = deepFilter(val);
        if (filteredObj === null) {
          delete json[key];
          changed = true;
        } else {
          json[key] = filteredObj;
        }
      }
    }

    // Guarda siempre (aunque no cambie), para mantener la estructura
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(json, null, 2), "utf8");
  } catch (e) {
    // Si no es JSON válido, lo copiamos tal cual (o lo ignoramos)
    // 5eTools casi siempre es JSON válido, pero por seguridad:
    try {
      fs.copyFileSync(inFile, outFile);
    } catch {}
  }
}

function walkDir(inDir, outDir) {
  for (const entry of fs.readdirSync(inDir, { withFileTypes: true })) {
    const inPath = path.join(inDir, entry.name);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      // Saltar directorios con nombres bloqueados
      if (BLOCK_PATTERNS.some((re) => re.test(entry.name))) continue;
      fs.mkdirSync(outPath, { recursive: true });
      walkDir(inPath, outPath);
    } else if (entry.isFile()) {
      // Salta archivos con nombres bloqueados
      if (BLOCK_PATTERNS.some((re) => re.test(entry.name))) continue;
      if (entry.name.toLowerCase().endsWith(".json")) {
        processFile(inPath, outPath);
      } else {
        // Copia no-JSON (raro en data), por si acaso
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(inPath, outPath);
      }
    }
  }
}

function main() {
  const inDir = process.argv[2];
  const outDir = process.argv[3];
  if (!inDir || !outDir) {
    console.error("Uso: node scripts/filter.js <inputDir> <outputDir>");
    process.exit(1);
  }
  walkDir(inDir, outDir);
  console.log(`Filtrado completo. Salida: ${outDir}`);
}

main();
