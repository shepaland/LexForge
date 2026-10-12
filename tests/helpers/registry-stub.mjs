// Test-only preload: replaces `fetch` so a CLI process never reaches the npm registry.
// With LEXFORGE_TEST_LATEST set, any URL answers with that version; otherwise the request rejects,
// which the update check reads as "no newer release".
globalThis.fetch = async (input) => {
  const latest = process.env.LEXFORGE_TEST_LATEST;

  if (!latest) {
    throw new Error(`registry-stub: no network in tests, refused ${String(input)}`);
  }

  return new Response(JSON.stringify({ version: latest }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
