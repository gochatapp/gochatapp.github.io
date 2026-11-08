// Regression test for the Setup screen "Load Models" flow in charxi_online.html
// Run: node tests/models-load.test.js
//
// Why this exists: a broken `escapeHtml()` produced a SyntaxError, which killed the
// whole app script — the page looked fine but no handlers were bound, so
// "Load Models" silently did nothing. This test runs the app's real script
// (charxi_online.js) inside a tiny DOM shim and clicks the button for real.
//
// Reads the key from tools/openrouter_api_key.txt (never prints it — only a hash).
"use strict";
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const { APP, extractAppScript, bootApp, readKey } = require("./dom-shim");

const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
const KNOWN_MODEL = "google/gemma-3-4b-it";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

/* ============================ tiny DOM shim ============================ */
// El / parseChildren / flatten / makeStorage / bootApp / readKey all live in ./dom-shim.js.


async function runLoadModels(document, key) {
  document.getElementById("apiKey").value = key;
  const p = document.getElementById("loadModels").onclick(); // the real handler (async)
  if (p && typeof p.then === "function") await p;            // wait for the real network call
  await new Promise(r => setImmediate(r));
  const msgEl = document.getElementById("setupMsg");
  const sel = document.getElementById("modelSelect");
  return {
    msg: msgEl.textContent,
    msgClass: msgEl.className,
    btnDisabled: document.getElementById("loadModels").disabled,
    options: sel.children.filter(c => c.tagName === "OPTION").map(o => o.value),
    selValue: sel.value,
    listHtml: document.getElementById("modelList").innerHTML,
    listButtons: document.getElementById("modelList").querySelectorAll("button[data-m]"),
  };
}

async function main() {
  const html = fs.readFileSync(APP, "utf8");
  const script = extractAppScript(html);

  /* 1. the app script must compile — a SyntaxError here silently disables every handler */
  let parseError = null;
  try { new vm.Script(script, { filename: "charxi_online.html#inline" }); }
  catch (e) { parseError = e; }
  check("app <script> (charxi_online.js) parses without SyntaxError", !parseError, parseError ? parseError.message : "OK");
  if (parseError) {
    console.log("\nAborting: the app's script does not compile, so nothing works in the browser.");
    process.exit(1);
  }

  /* 2. handlers are bound at boot (this is what was broken) */
  const STUB = ["anthropic/claude-3.5-sonnet", "deepseek/deepseek-chat", KNOWN_MODEL];
  const calls = [];
  const stubFetch = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ data: STUB.map(id => ({ id })) }) };
  };
  const app = bootApp({ html, script, fetchImpl: stubFetch });
  const btn = app.document.getElementById("loadModels");
  check("setup screen has the #loadModels button", !!btn);
  check("#loadModels has a click handler after boot", typeof btn.onclick === "function");

  /* 3. the escaping helper (the function that was mangled) still works */
  const escaped = vm.runInContext(`escapeHtml(${JSON.stringify('<a href="x">&</a>')})`, app.ctx);
  check("escapeHtml escapes & < > \" '", escaped === "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;", escaped);
  const md = vm.runInContext(`md2html(${JSON.stringify("```js\n<b>&\n```")})`, app.ctx);
  check("md2html escapes code blocks", md.includes("&lt;b&gt;") && md.includes("&amp;") && !md.includes("<b>"), md.slice(0, 70));

  /* 4. clicking Load Models hits OpenRouter /models with the typed key */
  const r1 = await runLoadModels(app.document, "sk-or-v1-testkey");
  check("fetch called once", calls.length === 1, `${calls.length} call(s)`);
  check("requests the OpenRouter models endpoint", !!calls[0] && calls[0].url === OR_MODELS_URL, calls[0] && calls[0].url);
  check("sends Authorization: Bearer <key>",
    !!calls[0] && !!calls[0].init.headers && calls[0].init.headers.Authorization === "Bearer sk-or-v1-testkey");
  check("success message shown", r1.msg.startsWith("✅") && r1.msg.includes("3 models loaded"), r1.msg);
  check("success message styled as ok", r1.msgClass === "ok", r1.msgClass);
  check("model list rendered", r1.listButtons.length === 3, `${r1.listButtons.length} button(s)`);
  check("model list markup contains model ids", r1.listHtml.includes(`data-m="${KNOWN_MODEL}"`));
  check("dropdown populated", STUB.every(id => r1.options.includes(id)), r1.options.join(", "));
  check("button re-enabled after load", r1.btnDisabled === false);

  /* 5. clicking a model row selects it */
  const target = r1.listButtons.find(b => b.dataset.m === "deepseek/deepseek-chat");
  check("model rows are clickable", !!target);
  if (target) {
    target.click();
    const selVal = app.document.getElementById("modelSelect").value;
    const after = app.document.getElementById("setupMsg").textContent;
    check("clicking a model sets the dropdown value", selVal === "deepseek/deepseek-chat", selVal);
    check("clicking a model confirms in the setup message", after.includes("Model: deepseek/deepseek-chat"), after);
  }

  /* 6. filter narrows the list */
  app.document.getElementById("modelFilter").value = "gemma";
  vm.runInContext("applyFilter()", app.ctx);
  const filtered = app.document.getElementById("modelList").querySelectorAll("button[data-m]");
  check("filter narrows the model list",
    filtered.length === 1 && filtered[0].dataset.m === KNOWN_MODEL, filtered.map(f => f.dataset.m).join(", "));

  /* 7. a bad key shows a readable error and re-enables the button */
  const badApp = bootApp({
    html, script,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  const r2 = await runLoadModels(badApp.document, "sk-or-v1-bad");
  check("401 shows an error message", r2.msg.startsWith("❌") && r2.msg.includes("bad key"), r2.msg);
  check("401 message styled as error", r2.msgClass === "err", r2.msgClass);
  check("button re-enabled after failure", r2.btnDisabled === false);

  /* 8. live check against the real OpenRouter API (free: /models costs no tokens) */
  const key = readKey();
  const keyId = crypto.createHash("sha256").update(key).digest("hex").slice(0, 10);
  console.log(`\nLive check — key from tools/openrouter_api_key.txt (sha256 ${keyId}…, ${key.length} chars)`);
  check("key looks like an OpenRouter key", key.startsWith("sk-or-"));
  const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  check("GET /auth/key returns 200", authRes.ok, `HTTP ${authRes.status}`);

  const liveApp = bootApp({ html, script, fetchImpl: fetch });
  const r3 = await runLoadModels(liveApp.document, key);
  const liveCount = r3.options.length - 1; // minus the "Select a model…" placeholder
  check("live Load Models succeeds", r3.msg.startsWith("✅"), r3.msg.slice(0, 160));
  check("live model list is non-trivial", liveCount > 100, `${liveCount} models`);
  check(`live list contains ${KNOWN_MODEL}`, r3.options.includes(KNOWN_MODEL));
  check("live list markup rendered", r3.listButtons.length > 0, `${r3.listButtons.length} rows`);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });

