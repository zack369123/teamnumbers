import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the RosterLab builder", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  // React inserts <!-- --> markers between adjacent text nodes; strip them so the
  // assertions below read as the copy a person actually sees.
  const html = (await response.text()).replaceAll("<!-- -->", "");
  assert.match(html, /<title>RosterLab — Team Number Builder<\/title>/i);
  assert.match(html, /Every name\./i);
  assert.match(html, /Every number\./i);
  assert.match(html, /Team identity/i);
  assert.match(html, /Numbers &amp;amp; roster|Numbers &amp; roster/i);
  assert.match(html, /Number font/i);
  assert.match(html, /Name font/i);
  assert.match(html, /Numbers only/i);
  assert.match(html, /Print size/i);
  assert.match(html, /Measure by/i);
  assert.match(html, /Clear margin \(in\)/i);
  assert.match(html, /300 DPI/i);
  assert.match(html, /Download PNG/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("bulk paste of a bare number list yields one number-only entry per value", async () => {
  const { parseRoster } = await import("../app/parse-roster.mjs");
  const parsed = parseRoster("0, 1, 2, 3, 3, 4, 10, 21, 21, 88, 91");

  assert.equal(parsed.length, 11);
  assert.deepEqual(
    parsed.map((player) => player.number),
    ["0", "1", "2", "3", "3", "4", "10", "21", "21", "88", "91"],
  );
  assert.ok(parsed.every((player) => player.name === ""));
});

test("bulk paste still understands name/number lines and mixed input", async () => {
  const { parseRoster } = await import("../app/parse-roster.mjs");

  assert.deepEqual(parseRoster("MORGAN, 08\nWILLIAMS 14\n27 LEE"), [
    { id: 1, name: "MORGAN", number: "08" },
    { id: 2, name: "WILLIAMS", number: "14" },
    { id: 3, name: "LEE", number: "27" },
  ]);

  assert.deepEqual(parseRoster("MORGAN, 08\n1, 2, 3"), [
    { id: 1, name: "MORGAN", number: "08" },
    { id: 2, name: "", number: "1" },
    { id: 3, name: "", number: "2" },
    { id: 4, name: "", number: "3" },
  ]);
});
