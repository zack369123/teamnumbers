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

  const html = await response.text();
  assert.match(html, /<title>RosterLab — Team Number Builder<\/title>/i);
  assert.match(html, /Every name\./i);
  assert.match(html, /Every number\./i);
  assert.match(html, /Team identity/i);
  assert.match(html, /Player roster/i);
  assert.match(html, /Download PNG/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
