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

test("server-renders the Braid protocol surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Braid — Borrow\. Stake\. Play\.<\/title>/i);
  assert.match(html, /Collateral is a conversation/);
  assert.match(html, /Stake the rail/i);
  assert.match(html, /Verifiable RPS/i);
  assert.match(html, /Outplay the agent/i);
  assert.match(html, /Pyth Entropy V2/i);
  assert.doesNotMatch(html, /Your site is taking shape|Codex is working/);
});
