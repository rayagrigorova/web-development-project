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

    const VALID_INPUTS = ["json", "yaml", "xml", "csv", "emmet", "auto"];
    const VALID_OUTPUTS = ["json", "yaml", "xml", "csv", "emmet"];
    const VALID_BOOL = ["true", "false", "1", "0", "yes", "no"];
    const VALID_CASE = ["upper", "camel", "snake", "none"];

    if (!raw) return out;

    raw.split(/\r?\n/).forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const [k, ...rest] = trimmed.split("=");
      const v = rest.join("=").trim();
      if (!k || v === undefined) return;

      const key = k.startsWith("replace.") ? k : k.toLowerCase();

      switch (key) {
        case "inputformat":
          if (!VALID_INPUTS.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: inputformat=${v}`);
          }
          out.inputformat = v.toLowerCase();
          break;
        case "outputformat":
          if (!VALID_OUTPUTS.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: outputformat=${v}`);
          }
          out.outputformat = v.toLowerCase();
          break;
        case "savetohistory":
        case "align":
          if (!VALID_BOOL.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: ${key}=${v}`);
          }
          out[key] = /^(true|1|yes)$/i.test(v);
          break;
        case "case":
          if (!VALID_CASE.includes(v.toLowerCase())) {
            throw Error(`Невалидна настройка: case=${v}`);
          }
          out.case = v.toLowerCase();
          break;
        default: {
          const m = key.match(/^replace\.(tag|val)\.(.+)$/);
          if (m) {
            const [, type, find] = m;
            out.replace[type][find] = v;
          } else {
            throw Error(`Непозната настройка: ${key}`);
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
      if (isObject(node)) {
        return Object.entries(node)
          .map(([k, v]) => {
            // ---------- ARRAYS ----------
            if (Array.isArray(v)) {
              if (v.length === 0) return k; // li → []

              const parts = v.map((el) => {
                // primitives → li{foo}
                if (!isObject(el) && !Array.isArray(el)) return `${k}{${el}}`;

                // empty objects → plain <li>
                if (isObject(el) && Object.keys(el).length === 0) return k;

                // objects / arrays → li>...
                const inner = walk(el);
                const grouped = inner.includes("+") ? `(${inner})` : inner;
                return `${k}>${grouped}`;
              });

              // li{a}+li{b}+li{c}
              return parts.join("+");
            }

            // ---------- NESTED OBJECT ----------
            if (isObject(v)) {
              const nested = walk(v);
              const needsGroup = nested.includes("+");
              return `${k}>${needsGroup ? `(${nested})` : nested}`;
            }

            // ---------- LEAF VALUE ----------
            return typeof v === "number" ? `${k}{${v}}` : `${k}{${String(v)}}`;
          })
          .join("+");
      }

      // ---------- ROOT-LEVEL ARRAY (RARE) ----------
      if (Array.isArray(node)) {
        return node.map(walk).join("+");
      }

      // ---------- LEAF VALUE ----------
      return `{${String(node)}}`;
    }

    return walk(json);
  }

  function mergeJSON(a, b) {
    const res = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (k in res) {
        // merge same-key siblings into array
        const prev = res[k];
        res[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
      } else {
        res[k] = v;
      }
    }
    return res;
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
      if (peek() === "(") {
        next(); // consume '('
        const group = parseNode();
        if (peek() !== ")") throw Error("Expected ')'");
        next(); // consume ')'
        return { __group: group };
      }

      const name = parseIdent();

      let value = {};
      let count = 1;

      // Optional: repetition
      if (peek() === "*") {
        next();
        count = parseNumber();
      }

      // Optional: leaf content
      if (peek() === "{") {
        next();
        const text = parseText();
        value = text;
      }

      // Optional: nested child
      if (peek() === ">") {
        next();
        let child = parseTerm();
        if (child && child.__group) child = child.__group;
        value = child;
      }

      // Return object or repeated array
      if (count > 1) {
        return { name, value: repeat(value, count) };
      } else {
        return { name, value };
      }
    }

    function buildObj(term) {
      const coerce = (v) => {
        const n = Number(v);
        return String(n) === v ? n : v;
      };

      function flatten(node) {
        if (
          isObject(node) &&
          "name" in node &&
          "value" in node &&
          typeof node.name === "string"
        ) {
          return { [node.name]: flatten(node.value) };
        }
        if (Array.isArray(node)) {
          return node.map(flatten);
        }
        return node;
      }

      const obj = {};

      if (Array.isArray(term.value)) {
        obj[term.name] = term.value.map((v) =>
          typeof v === "string" || typeof v === "number"
            ? coerce(v)
            : flatten(v)
        );
        return obj;
      }

      if (term.value !== "" && term.value !== null) {
        if (typeof term.value === "string") {
          obj[term.name] = coerce(term.value);
        } else {
          obj[term.name] = flatten(term.value);
        }
      } else {
        obj[term.name] = {};
      }

      return obj;
    }

    function parseChain() {
      const firstTerm = parseTerm();
      const tree = firstTerm.__group ? firstTerm.__group : buildObj(firstTerm);

      // Helper returns the payload object of the **current parent tag**,
      // i.e. the place where children or siblings should be attached
      const getParentPtr = () => {
        let obj = tree;
        // walk to deepest object whose only key is an object
        while (isObject(obj) && Object.keys(obj).length === 1) {
          const k = Object.keys(obj)[0];
          if (isObject(obj[k])) obj = obj[k];
          else break;
        }
        return obj;
      };

      while (true) {
        if (peek() === ">") {
          /* ---------- CHILD ---------- */
          next(); // consume '>'
          const child = parseTerm();
          const childOb = child.__group ? child.__group : buildObj(child);

          const parentPtr = getParentPtr();
          const parentKey = Object.keys(parentPtr)[0];

          if (
            isObject(childOb) &&
            Object.keys(childOb).length === 1 &&
            isObject(Object.values(childOb)[0]) &&
            "name" in Object.values(childOb)[0] &&
            "value" in Object.values(childOb)[0]
          ) {
            // Flatten nested { name, value } under parent
            const inner = Object.values(childOb)[0];
            parentPtr[parentKey][inner.name] = inner.value;
          } else {
            const [childKey, childVal] = Object.entries(childOb)[0];
            parentPtr[parentKey][childKey] = childVal;
          }

          if (peek() === ">") {
            const childKey = Object.keys(childOb)[0];
            parentPtr[childKey] =
              parentPtr[childKey] || childOb[childKey] || {};
          }
        } else if (peek() === "+") {
          next();
          const sibling = parseTerm();
          const siblingOb = sibling.__group
            ? sibling.__group
            : buildObj(sibling);

          const parentPtr = getParentPtr();
          for (const [k, v] of Object.entries(siblingOb)) {
            if (k in parentPtr) {
              const prev = parentPtr[k];
              parentPtr[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
            } else {
              parentPtr[k] = v;
            }
          }
        } else {
          break;
        }
      }

      return tree;
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
    if (Array.isArray(obj)) {
      const children = obj
        .map((item) => buildXML(item, "record", "  "))
        .join("");
      return `<root>\n${children}</root>`;
    }
    return buildXML(obj, "root").trim();
  }

  function xmlNodeToJSON(node) {
    if (node.nodeType === 3) {
      const raw = node.nodeValue.trim();
      const n = Number(raw);
      return String(n) === raw ? n : raw;
    }

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
    function unwrap(node) {
      if (Array.isArray(node)) return node.map(unwrap);
      if (typeof node === "object" && node !== null) {
        const keys = Object.keys(node);
        if (keys.length === 1 && keys[0] === "#text") return node["#text"];
        return Object.fromEntries(keys.map((k) => [k, unwrap(node[k])]));
      }
      return node;
    }
    return { [root.nodeName]: unwrap(xmlNodeToJSON(root)) };
  }

  function flattenObject(obj, prefix = "") {
    return Object.entries(obj).reduce((acc, [key, val]) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        Object.assign(acc, flattenObject(val, newKey));
      } else {
        acc[newKey] = val;
      }
      return acc;
    }, {});
  }

  function unflattenObject(flat) {
    const out = {};
    for (const [key, val] of Object.entries(flat)) {
      const parts = key.split(".");
      let ptr = out;
      parts.forEach((part, idx) => {
        if (idx === parts.length - 1) {
          // last part → assign value, try to coerce numbers
          const num = Number(val);
          ptr[part] = !Number.isNaN(num) && val.trim() !== "" ? num : val;
        } else {
          ptr[part] = ptr[part] || {};
          ptr = ptr[part];
        }
      });
    }
    return out;
  }

  /* CSV */
  function jsonToCSV(data) {
    const arr = Array.isArray(data) ? data : [data];
    const flat = arr.map(flattenObject);
    const cols = Array.from(new Set(flat.flatMap((obj) => Object.keys(obj))));
    const header = cols.join(",");
    const rows = flat.map((row) =>
      cols
        .map((c) => {
          const cell = row[c] ?? "";
          return /[,"]/g.test(cell)
            ? `"${String(cell).replace(/"/g, '""')}"`
            : cell;
        })
        .join(",")
    );
    return header + "\n" + rows.join("\n");
  }

  function csvToJSON(text) {
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    if (!headerLine) return [];

    const cols = headerLine.split(",");
    const rows = lines.map((line) => line.split(","));

    const objects = rows.map((cells) => {
      const flat = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
      return unflattenObject(flat);
    });

    return objects.length === 1 ? objects[0] : objects;
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
      if (isObject(node)) {
        return Object.fromEntries(
          Object.entries(node).map(([k, v]) => {
            const nk = opts.replace.tag[k] || k;
            return [nk, walk(v)];
          })
        );
      }
      return Object.prototype.hasOwnProperty.call(
        opts.replace.val,
        String(node)
      )
        ? opts.replace.val[String(node)]
        : node;
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

    const needsChanges =
      opts.case !== "none" ||
      Object.keys(opts.replace.tag).length > 0 ||
      Object.keys(opts.replace.val).length > 0;

    if (inFmt === outFmt && !needsChanges) {
      if (inFmt === "json" && opts.align) {
        try {
          const pretty = JSON.stringify(JSON.parse(inputStr), null, 2);
          return { result: pretty, meta: { inFmt, outFmt, opts } };
        } catch {}
      }
      return { result: inputStr, meta: { inFmt, outFmt, opts } };
    }

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
        data = csvToJSON(inputStr);
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
        result = jsonToXML(data);
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
    jsonToEmmet,
    emmetToJSON,
    jsonToXML,
    __testonly: {
      mergeJSON,
    },
  };
})(typeof window !== "undefined" ? window : global);
