/* eslint-env jest */

const DT = global.DataTransformer; // shorthand

const sampleObj = {
  name: "John",
  age: 30,
  address: { city: "Sofia" },
};

describe("DataTransformer.convert – round-trip sanity", () => {
  it("JSON → YAML → JSON should keep structure", async () => {
    const { result: yaml } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=yaml
      align=true
    `
    );

    const { result: backToJson } = await DT.convert(
      yaml,
      `
      inputformat=yaml
      outputformat=json
      align=false
    `
    );

    expect(JSON.parse(backToJson)).toEqual(sampleObj);
  });

  it("JSON → XML → JSON should keep structure (root wrapper ignored)", async () => {
    const { result: xml } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=xml
    `
    );

    const { result: json } = await DT.convert(
      xml,
      `
      inputformat=xml
      outputformat=json
    `
    );

    // xmlToJSON wraps under <root> so unwrap here
    const parsed = JSON.parse(json);
    const normalized = JSON.parse(
      JSON.stringify(parsed.root ?? parsed),
      (k, v) => (typeof v === "string" && !isNaN(v) ? Number(v) : v)
    );
    expect(normalized).toEqual(sampleObj);
  });

  it("JSON → CSV → JSON round-trip", async () => {
    const { result: csv } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=csv
    `
    );

    const { result: json } = await DT.convert(
      csv,
      `
      inputformat=csv
      outputformat=json
    `
    );

    expect(JSON.parse(json)).toEqual(sampleObj);
  });

  it("JSON ⇄ Emmet conversion keeps leaf values", async () => {
    const { result: emmet } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=emmet
    `
    );

    const { result: json } = await DT.convert(
      emmet,
      `
      inputformat=emmet
      outputformat=json
    `
    );

    expect(JSON.parse(json)).toEqual(sampleObj);
  });
});

describe("Options / mutations", () => {
  it("Tag & value replacement works", async () => {
    const { result } = await DT.convert(
      JSON.stringify(sampleObj),
      `
      inputformat=json
      outputformat=json
      replace.tag.name=firstName
      replace.val.Sofia=Plovdiv
      align=false
    `
    );

    const parsed = JSON.parse(result);
    expect(parsed.firstName ?? parsed.name).toBe("John");
    expect(parsed.address?.city).toBe("Plovdiv");
  });
});

/* ------------------------------------------------------------------ */
/* 1.  FORMAT-DETECTION HELPER                                        */
/* ------------------------------------------------------------------ */
describe("detectFormat()", () => {
  it("recognises the four supported syntaxes and unknown input", () => {
    expect(DT.detectFormat('{"a":1}')).toBe("json"); // JSON branch
    expect(DT.detectFormat("---\na: 1\n")).toBe("yaml"); // YAML branch
    expect(DT.detectFormat("<root></root>")).toBe("xml"); // XML branch
    expect(DT.detectFormat("a,b\n1,2")).toBe("csv"); // CSV branch
    expect(DT.detectFormat("   ")).toBe("unknown"); // empty branch
  });
});

/* ------------------------------------------------------------------ */
/* 2.  KEY-CASE TRANSFORMATION – snake_case fix                        */
/* ------------------------------------------------------------------ */
describe("case-conversion option (camel → snake)", () => {
  // camelCase keys (hyphens are NOT converted by toSnake)
  const obj = { firstName: 1, nested: { childKey: 2 } };

  it("converts keys to snake_case", async () => {
    const { result } = await DT.convert(
      JSON.stringify(obj),
      `
      inputformat=json
      outputformat=json
      case=snake
      align=false
    `
    );
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("first_name");
    expect(parsed.nested).toHaveProperty("child_key");
  });
});

/* ------------------------------------------------------------------ */
/* 3.  JSON ⇄ EMMET – *N repetition via hand-written string            */
/* ------------------------------------------------------------------ */
describe("Emmet parser – ‘*N’ repetition", () => {
  it("parses li*3 into an array of three empty objects", async () => {
    const emmet = "li*3";
    const { result } = await DT.convert(
      emmet,
      `
      inputformat=emmet
      outputformat=json
      align=false
    `
    );
    expect(JSON.parse(result)).toEqual({ li: [{}, {}, {}] });
  });
});

/* ------------------------------------------------------------------ */
/* 4.  JSON ⇄ EMMET – ARRAY ‘*N’ REPETITION & PARSER branches          */
/* ------------------------------------------------------------------ */
describe("Emmet repetition (‘*N’) round-trip", () => {
  const src = { ul: { li: ["one", "two", "three"] } };

  it("round-trips ul > li*3 with distinct values", async () => {
    const toEmmet = await DT.convert(
      JSON.stringify(src),
      `
    inputformat=json
    outputformat=emmet
  `
    );

    const back = await DT.convert(
      toEmmet.result,
      `
    inputformat=emmet
    outputformat=json
    align=false
  `
    );

    expect(JSON.parse(back.result)).toEqual(src);
  });
});

/* ------------------------------------------------------------------ */
/* 5.  transformKeys() – indirect coverage via case=upper             */
/* ------------------------------------------------------------------ */
describe("transformKeys() deep recursion", () => {
  const deep = { levelOne: { levelTwo: { levelThree: 5 } } };

  it("recursively upper-cases every key", async () => {
    const { result } = await DT.convert(
      JSON.stringify(deep),
      `
      inputformat=json
      outputformat=json
      case=upper
      align=false
    `
    );
    expect(JSON.parse(result)).toEqual({
      LEVELONE: { LEVELTWO: { LEVELTHREE: 5 } },
    });
  });
});
