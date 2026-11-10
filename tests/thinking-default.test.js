// Verifies that "thinking" (OpenRouter reasoning tokens) is OFF by default in
// charxi_online.html, is visible as a Setup checkbox, and only turns on when the
// user asks for it.
// Run: node tests/thinking-default.test.js
//
// Why the explicit flag matters (measured live, see the last section):
//   reasoning:{enabled:false} -> 0 reasoning tokens
//   no reasoning param        -> the model reasons anyway (slower, more tokens)
// so the app must send the flag, and its default must be off.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { APP, extractAppScript, loadPageCss, bootApp, readKey } = require("./dom-shim");

const THINK_LS_KEY = "gochat_think";
const OR_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}
function info(name, extra = "") { console.log(`INFO  ${name}${extra ? " — " + extra : ""}`); }

// A localStorage seed that boots straight into a usable chat.
const READY = {
  gochat_apiKey: "sk-or-v1-testkey",
  gochat_model: "test/model",
  gochat_roles: JSON.stringify([{ id: "r1", name: "Test Role", prompt: "You are a test role." }]),
  gochat_activeRoleId: "r1",
};

function stubFetch(content = "hi there") {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return {
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content } }], usage: {} }),
      text: async () => "",
    };
  };
  return { calls, fetchImpl };
}

async function send(app, text) {
  app.document.getElementById("input").value = text;
  await vm.runInContext("sendMessage()", app.ctx);
  await new Promise(r => setImmediate(r));
}

const readState = (app, expr) => vm.runInContext(expr, app.ctx);

async function callChat(model, key, extra) {
  const res = await fetch(OR_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "file:///",
      "X-Title": "GoChat",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "What is 2+2? Answer with just the number." }],
      max_tokens: 200,
      ...extra,
    }),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}

async function main() {
  const html = fs.readFileSync(APP, "utf8");
  const script = extractAppScript(html, path.dirname(APP));   // charxi_online.js
  const css = loadPageCss(html, path.dirname(APP));           // charxi_online.css

  /* 1. Setup screen exposes a thinking control that starts unchecked */
  check("#thinkToggle exists in the markup", /id="thinkToggle"/.test(html));
  check("#thinkToggle is a checkbox", /id="thinkToggle"[^>]*type="checkbox"|type="checkbox"[^>]*id="thinkToggle"/.test(html));
  const setupAt = html.indexOf('id="setupView"');
  const toggleAt = html.indexOf('id="thinkToggle"');
  check("thinking control lives in the Setup card", setupAt > -1 && toggleAt > setupAt, `setupView@${setupAt} thinkToggle@${toggleAt}`);
  check("checkbox is NOT checked in the static markup", !/<input[^>]*id="thinkToggle"[^>]*\schecked/.test(html));
  check("Setup copy states the default", /Off by default/.test(html));
  check("checkbox styling exists", /\.card \.check input\{/.test(css));

  /* 2. a first-time boot defaults to OFF and records that default */
  const fresh = bootApp({ html, script, fetchImpl: stubFetch().fetchImpl });
  check("fresh boot: state.think is false", readState(fresh, "state.think") === false);
  check(`fresh boot: localStorage ${THINK_LS_KEY} === "0"`,
    fresh.localStorage.getItem(THINK_LS_KEY) === "0", String(fresh.localStorage.getItem(THINK_LS_KEY)));
  check("fresh boot: Setup checkbox is unchecked", fresh.document.getElementById("thinkToggle").checked === false);

  /* 3. the request sent by default explicitly disables reasoning */
  const s1 = stubFetch("hi there");
  const app = bootApp({ html, script, fetchImpl: s1.fetchImpl, seed: READY });
  check("booted straight into a chat with a role", readState(app, "!!currentRole()") === true);
  check("chat boot keeps thinking off", readState(app, "state.think") === false);
  await send(app, "hello");
  check("one chat request sent", s1.calls.length === 1, `${s1.calls.length} call(s)`);
  check("request targets chat completions", s1.calls[0] && s1.calls[0].url === OR_CHAT_URL);
  const b1 = (s1.calls[0] || {}).body || {};
  check("default payload: reasoning.enabled === false",
    !!(b1.reasoning && b1.reasoning.enabled === false), JSON.stringify(b1.reasoning));
  check("default payload: no 'think step by step' system nudge",
    !/think step by step/i.test(b1.messages[0].content));
  check("default payload: reply rendered in chat",
    /hi there/.test(app.document.getElementById("messages").textContent));


  /* 4. the Setup checkbox turns it on (and persists the choice) */
  const cb = app.document.getElementById("thinkToggle");
  cb.checked = true;
  cb.onchange({ target: cb });
  check("checkbox on: state.think becomes true", readState(app, "state.think") === true);
  check(`checkbox on: localStorage ${THINK_LS_KEY} === "1"`, app.localStorage.getItem(THINK_LS_KEY) === "1");
  check("checkbox on: confirmed in the setup message",
    /Thinking ON/.test(app.document.getElementById("setupMsg").textContent),
    app.document.getElementById("setupMsg").textContent);
  await send(app, "again");
  const b2 = (s1.calls[s1.calls.length - 1] || {}).body || {};
  check("thinking on: payload sets reasoning.enabled === true",
    !!(b2.reasoning && b2.reasoning.enabled === true), JSON.stringify(b2.reasoning));
  check("thinking on: system prompt nudges step-by-step reasoning",
    /think step by step/i.test(b2.messages[0].content));

  /* 5. `.think off` turns it back off and keeps the checkbox in sync */
  vm.runInContext("handleCommand('.think off')", app.ctx);
  check(".think off: state.think is false", readState(app, "state.think") === false);
  check(`.think off: localStorage ${THINK_LS_KEY} === "0"`, app.localStorage.getItem(THINK_LS_KEY) === "0");
  check(".think off: unchecks the Setup checkbox", cb.checked === false);
  await send(app, "third");
  const b3 = (s1.calls[s1.calls.length - 1] || {}).body || {};
  check("after .think off the payload disables reasoning again", !!(b3.reasoning && b3.reasoning.enabled === false));

  /* 6. an explicit saved "1" is honoured (the user's own choice survives a reload) */
  const s2 = stubFetch("ok");
  const persisted = bootApp({ html, script, fetchImpl: s2.fetchImpl, seed: { ...READY, [THINK_LS_KEY]: "1" } });
  check("saved think=1 boots with thinking on", readState(persisted, "state.think") === true);
  check("saved think=1 pre-checks the Setup box", persisted.document.getElementById("thinkToggle").checked === true);
  await send(persisted, "hi");
  check("saved think=1 payload enables reasoning", s2.calls[0].body.reasoning.enabled === true);

  /* 7. models that refuse to disable reasoning still answer (400 -> retry without the flag) */
  const attempts = [];
  const forceFetch = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    attempts.push(body);
    if (attempts.length === 1) {
      return {
        ok: false, status: 400, json: async () => ({}),
        text: async () => JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled." } }),
      };
    }
    return {
      ok: true, status: 200, text: async () => "",
      json: async () => ({ choices: [{ message: { content: "fallback answer" } }] }),
    };
  };
  const forced = bootApp({ html, script, fetchImpl: forceFetch, seed: READY });
  await send(forced, "hello");
  const forcedText = forced.document.getElementById("messages").textContent;
  check("forced-reasoning model is retried once", attempts.length === 2, `${attempts.length} request(s)`);
  check("first attempt kept reasoning off", !!(attempts[0] && attempts[0].reasoning && attempts[0].reasoning.enabled === false));
  check("retry drops the reasoning flag", !!attempts[1] && !("reasoning" in attempts[1]));
  check("user is told why", /thinking off/i.test(forcedText), forcedText.slice(0, 120));
  check("reply still arrives", /fallback answer/.test(forcedText));
  check("no error bubble was shown", !/\u274c/.test(forcedText), forcedText.slice(0, 120));

  /* 8. live proof against OpenRouter (free reasoning models only -> no cost) */
  const { key, model: defaultModel } = readKey();
  const keyId = crypto.createHash("sha256").update(key).digest("hex").slice(0, 10);
  console.log(`\nLive check — key from tools/openrouter_api_key.txt (sha256 ${keyId}…, ${key.length} chars, model: ${defaultModel})`);
  const auth = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${key}` } });
  check("GET /auth/key returns 200", auth.ok, `HTTP ${auth.status}`);

  const models = ((await (await fetch(OR_MODELS_URL)).json()).data || []);
  const freeReasoning = models
    .filter(m => (m.supported_parameters || []).includes("reasoning") && Number(m.pricing && m.pricing.prompt) === 0)
    .map(m => m.id);
  info("free reasoning-capable models available", String(freeReasoning.length));

  let model = null, offRes = null;
  for (const id of freeReasoning.slice(0, 12)) {
    const r = await callChat(id, key, { reasoning: { enabled: false } });
    if (r.status === 200 && r.json && r.json.usage) { model = id; offRes = r; break; }
  }
  check("found a free reasoning model to probe", !!model, model || freeReasoning.slice(0, 4).join(", "));
  if (model) {
    const det = offRes.json.usage.completion_tokens_details || {};
    check("live: reasoning:{enabled:false} -> 0 reasoning tokens", det.reasoning_tokens === 0,
      `reasoning_tokens=${det.reasoning_tokens}`);
    const bare = await callChat(model, key, {});
    if (bare.status === 200) {
      const bd = (bare.json.usage || {}).completion_tokens_details || {};
      info("live: same model without the reasoning param", `reasoning_tokens=${bd.reasoning_tokens} — the default must stay explicit`);
    } else {
      info("live: same model without the reasoning param", `HTTP ${bare.status} (skipped)`);
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error("FATAL:", (e && e.stack) || e); process.exit(1); });

