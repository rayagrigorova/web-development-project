// convert.js – core transformation engine (Person 2)
// --------------------------------------------------------
// This file is **logic‑only** – no DOM calls, no UI code.
// Everything is exposed through the global `DataTransformer` singleton so
// that script.js (UI layer) can stay minimal and just call
// `DataTransformer.convert(inputString, settingsString)` and
// populate the output / history the same way it already does.
//
// Supported settings (key = value, case‑insensitive):
//   inputformat   –  json | emmet | yaml | xml | csv | auto*
//   outputformat  –  json | emmet | yaml | xml | csv
//   savetohistory –  true | false
//   align         –  true | false      (pretty‑print / indent)
//   case          –  upper | camel | snake | none (key renaming)
//   replace.tag.X = Y   (rename tag/field X ⇒ Y)
//   replace.val.X = Y   (replace literal value X ⇒ Y)
//
// *When inputformat is omitted or set to "auto" the engine will try to
//  detect JSON/YAML/CSV by simple heuristics.
//
// Notes
// -----
// • JSON ⇄ Emmet is implemented here in plain JS (no deps).
// • For YAML / XML / CSV we lazily load tiny CDN helpers the first time
//   each direction is requested – keeping the initial bundle small.
// • The algorithms are deliberately kept *very* small‑feature. They are
//   enough for coursework demos, but you can swap any function with a
//   more robust library without touching the rest of the code.
//
// --------------------------------------------------------
(function (global) {
  "use strict";

  /* ─────────────────────────  tiny helpers  ───────────────────────── */
  const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
  const repeat = (str, n) => Array.from({ length: n }, () => str);

  /* Case helpers (non‑locale aware on purpose) */
  const toCamel = (s) => s.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  const toSnake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  const toUpper = (s) => s.toUpperCase();
  const CASE_FNS = {
    camel: toCamel,
    snake: toSnake,
    upper: toUpper,
    none: (s) => s,
  };

  /* ──────────────────────  SETTINGS PARSER  ───────────────────────── */
  function parseSettings(raw) {
    const out = {
      inputformat: "auto",
      outputformat: "json",
      savetohistory: false,
      align: true,
      case: "none",
      replace: { tag: {}, val: {} },
    };

    if (!raw) return out;

    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return; // comment / empty
      const [k, ...rest] = trimmed.split("=");
      const v = rest.join("=");
      if (!k || v === undefined) return;

      const key = k.toLowerCase();
      switch (key) {
        case "inputformat":
        case "outputformat":
          out[key] = v.toLowerCase();
          break;
        case "savetohistory":
        case "align":
          out[key] = /^(true|1|yes)$/i.test(v);
          break;
        case "case":
          out.case = v.toLowerCase();
          break;
        default: {
          const m = key.match(/^replace\.(tag|val)\.(.+)$/);
          if (m) {
            const [, type, find] = m;
            out.replace[type][find] = v;
          }
        }
      }
    });

    return out;
  }

  /* ───────────────────────  FORMAT DETECTION  ─────────────────────── */
  function detectFormat(str) {
    const trimmed = str.trim();
    if (!trimmed) return "unknown";
    try {
      JSON.parse(trimmed);
      return "json";
    } catch (_) {}
    if (/^---/.test(trimmed) || /:\s*[^:]+/m.test(trimmed)) return "yaml";
    if (trimmed.startsWith("<") && trimmed.endsWith(">")) return "xml";
    if (trimmed.includes(",")) return "csv";
    return "unknown";
  }

  /* ───────────────────  JSON ⇄ Emmet conversions  ─────────────────── */
  function jsonToEmmet(json) {
    function walk(node) {
      if (Array.isArray(node)) {
        // assume repeated identical element definitions
        if (node.length === 0) return "";
        const first = node[0];
        const repeated = walk(first);
        return `${repeated}*${node.length}`;
      }
      if (isObject(node)) {
        return Object.entries(node)
          .map(([k, v]) => {
            const inner = walk(v);
            return inner ? `${k}>${inner}` : k;
          })
          .join("+");
      }
      // primitive → treat as text node
      return `{${String(node)}}`;
    }

    return walk(json);
  }

  // Extremely small parser that supports only the grammar we emit above:
  //    node        := chain ('+' chain)*
  //    chain       := term ('>' term)*
  //    term        := ident [ '*' number | '>' term | '{' text '}' ]
  function emmetToJSON(str) {
    let i = 0;
    function peek() {
      return str[i];
    }
    function next() {
      return str[i++];
    }
    function eat(chars) {
      if (str.substr(i, chars.length) === chars) i += chars.length;
      else throw Error("Unexpected token");
    }
    function isIdentChar(c) {
      return /[A-Za-z0-9_-]/.test(c);
    }

    function parseIdent() {
      let out = "";
      while (isIdentChar(peek())) out += next();
      if (!out) throw Error("Expected identifier");
      return out;
    }

    function parseNumber() {
      let out = "";
      while (/[0-9]/.test(peek())) out += next();
      return Number(out);
    }

    function parseText() {
      let out = "";
      while (peek() && peek() !== "}") out += next();
      eat("}");
      return out;
    }

    function parseTerm() {
      const name = parseIdent();
      let value = "";
      if (peek() === "*") {
        next(); // *
        const count = parseNumber();
        value = repeat({ __tag: name }, count); // placeholder, will be fixed later
      }
      if (peek() === "{") {
        next();
        value = parseText();
      }
      if (peek() === ">") {
        next();
        const child = parseTerm();
        value = child;
      }
      return { name, value };
    }

    function buildObj(term) {
      const obj = {};
      if (Array.isArray(term.value)) {
        obj[term.name] = term.value.map(() => ({}));
      } else if (isObject(term.value)) {
        obj[term.name] = term.value;
      } else if (term.value !== "") {
        obj[term.name] = term.value;
      } else {
        obj[term.name] = {};
      }
      return obj;
    }

    function parseChain() {
      let term = parseTerm();
      let currentObj = buildObj(term);
      let ptr = currentObj;
      while (peek() === ">") {
        next();
        term = parseTerm();
        const childObj = buildObj(term);
        // attach child into last level of ptr
        const key = Object.keys(ptr)[0];
        ptr[key] = childObj;
        ptr = childObj;
      }
      return currentObj;
    }

    function mergeJSON(a, b) {
      const kA = Object.keys(a)[0];
      const kB = Object.keys(b)[0];
      const res = {};
      res[kA] = isObject(a[kA]) ? { ...a[kA] } : a[kA];
      res[kB] = isObject(b[kB]) ? { ...b[kB] } : b[kB];
      return { ...a, ...b };
    }

    function parseNode() {
      let chain = parseChain();
      while (peek() === "+") {
        next();
        const rhs = parseChain();
        chain = mergeJSON(chain, rhs);
      }
      return chain;
    }

    const tree = parseNode();
    if (i !== str.length) throw Error("Unexpected trailing input");
    return tree;
  }

  /* ────────────────────  YAML / XML / CSV helpers  ─────────────────── */
  // Lazy CDN loader – resolves with the requested global symbol
  function lazyLoad(url, globalSym) {
    return new Promise((resolve, reject) => {
      if (global[globalSym]) return resolve(global[globalSym]);
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => resolve(global[globalSym]);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  /* YAML */
  async function jsonToYAML(obj, align) {
    const jsYaml = await lazyLoad(
      "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js",
      "jsyaml"
    );
    return jsYaml.dump(obj, {
      indent: 2,
      flowLevel: -1,
      sortKeys: false,
      lineWidth: 160,
    });
  }
  async function yamlToJSON(text) {
    const jsYaml = await lazyLoad(
      "https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js",
      "jsyaml"
    );
    return jsYaml.load(text);
  }

  /* XML */
  /* ---------- XML helpers (fallback, no external lib) ---------- */
  function buildXML(node, tagName = "root", indent = "") {
    const pad = "  "; // two-space indent
    if (typeof node !== "object" || node === null) {
      return `${indent}<${tagName}>${String(node)}</${tagName}>\n`;
    }

    if (Array.isArray(node)) {
      return node
        .map((n) => buildXML(n, tagName, indent)) // repeat same tag
        .join("");
    }

    const inner = Object.entries(node)
      .map(([k, v]) => buildXML(v, k, indent + pad))
      .join("");
    return `${indent}<${tagName}>\n${inner}${indent}</${tagName}>\n`;
  }

  function jsonToXML(obj) {
    // choose the top-level tag name based on root key or fallback to <root>
    if (typeof obj === "object" && !Array.isArray(obj) && obj !== null) {
      const [rootKey] = Object.keys(obj);
      if (rootKey) {
        return buildXML(obj[rootKey], rootKey).trim();
      }
    }
    return buildXML(obj).trim();
  }

  function xmlNodeToJSON(node) {
    // Element → object; Text → value
    if (node.nodeType === 3) return node.nodeValue.trim(); // TEXT_NODE

    const obj = {};
    node.childNodes.forEach((child) => {
      const val = xmlNodeToJSON(child);
      if (val === "") return; // ignore empty text
      const tag = child.nodeName;
      if (obj[tag]) {
        // make it an array if repeated
        obj[tag] = Array.isArray(obj[tag])
          ? [...obj[tag], val]
          : [obj[tag], val];
      } else {
        obj[tag] = val;
      }
    });
    return obj;
  }

  function xmlToJSON(xmlStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, "application/xml");
    const root = doc.documentElement;
    return { [root.nodeName]: xmlNodeToJSON(root) };
  }

  /* CSV */
  async function jsonToCSV(obj) {
    const papa = window.Papa;

    return papa.unparse(obj);
  }
  function jsonToCSV(obj) {
    const papa = window.Papa;

    const data = Array.isArray(obj) ? obj : [obj];
    return papa.unparse(data);
  }

  /* ─────────────────────  key‑case + replacements  ─────────────────── */
  function transformKeys(obj, fn) {
    if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, fn));
    if (!isObject(obj)) return obj;
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [fn(k), transformKeys(v, fn)])
    );
  }

  function applyReplacements(obj, opts) {
    function walk(node) {
      if (Array.isArray(node)) return node.map(walk);
      if (!isObject(node)) {
        if (typeof node === "string" && opts.replace.val[node] !== undefined) {
          return opts.replace.val[node];
        }
        return node;
      }
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => {
          const nk = opts.replace.tag[k] || k;
          return [nk, walk(v)];
        })
      );
    }
    return walk(obj);
  }

  /* ───────────────────────────  MAIN API  ─────────────────────────── */
  async function convert(inputStr, settingsStr = "") {
    const opts = parseSettings(settingsStr);

    // Determine formats ------------------------------------------------
    let inFmt =
      opts.inputformat === "auto" ? detectFormat(inputStr) : opts.inputformat;
    let outFmt = opts.outputformat;

    if (inFmt === "unknown")
      throw Error(
        "Не може да се определи входният формат и не е зададен ръчно."
      );
    if (inFmt === outFmt)
      return { result: inputStr, meta: { inFmt, outFmt, opts } };

    // Step 1 – parse INPUT into JS object / primitive ------------------
    let data;
    switch (inFmt) {
      case "json":
        data = JSON.parse(inputStr);
        break;
      case "yaml":
        data = await yamlToJSON(inputStr);
        break;
      case "xml":
        data = await xmlToJSON(inputStr);
        break;
      case "csv":
        data = await csvToJSON(inputStr);
        break;
      case "emmet":
        data = emmetToJSON(inputStr.trim());
        break;
      default:
        throw Error("Непознат входен формат: " + inFmt);
    }

    // Step 2 – generic key / value transforms --------------------------
    if (opts.case && opts.case !== "none") {
      const fn = CASE_FNS[opts.case] || ((s) => s);
      data = transformKeys(data, fn);
    }
    data = applyReplacements(data, opts);

    // Step 3 – stringify to OUTPUT -------------------------------------
    let result;
    switch (outFmt) {
      case "json": {
        result = opts.align
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
        break;
      }
      case "yaml": {
        result = await jsonToYAML(data, opts.align);
        break;
      }
      case "xml": {
        result = await jsonToXML(data);
        break;
      }
      case "csv": {
        result = jsonToCSV(data);
        break;
      }
      case "emmet": {
        result = jsonToEmmet(data);
        break;
      }
      default:
        throw Error("Неподдържан изходен формат: " + outFmt);
    }

    return { result, meta: { inFmt, outFmt, opts } };
  }

  /* ─────────────────────  public surface  ─────────────────────────── */
  global.DataTransformer = {
    parseSettings,
    convert, // async → returns { result, meta }
    detectFormat, // exposed mostly for debugging
  };
})(typeof window !== "undefined" ? window : global);
