// Smoke test for OpenRouter integration used by charxi_online.html
// Run: node tests/openrouter-smoke.test.js
// Reads key from tools/openrouter_api_key.txt - never prints the key.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KEY_FILE = path.join(ROOT, "tools", "openrouter_api_key.txt");
const OR = "https://openrouter.ai/api/v1";
const MODEL = "google/gemma-3-4b-it";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

function readKey() {
  if (!fs.existsSync(KEY_FILE)) throw new Error(`key file not found: ${KEY_FILE}`);
  const key = fs.readFileSync(KEY_FILE, "utf8").trim();
  if (!key) throw new Error("key file is empty");
  return key;
}

async function main() {
  const key = readKey();
  console.log(`Key loaded from tools/openrouter_api_key.txt (length ${key.length}, masked ${key.slice(0, 7)}...${key.slice(-3)})`);
  check("key looks like an OpenRouter key", key.startsWith("sk-or-"));

  // 1. Validate key
  const authRes = await fetch(`${OR}/auth/key`, { headers: { Authorization: `Bearer ${key}` } });
  const auth = await authRes.json().catch(() => ({}));
  check("GET /auth/key returns 200", authRes.ok, `HTTP ${authRes.status}`);
  check("auth response has data", !!auth.data);

  // 2. Model list contains the exact model id charxi_online.html uses
  const modelsRes = await fetch(`${OR}/models`, { headers: { Authorization: `Bearer ${key}` } });
  check("GET /models returns 200", modelsRes.ok, `HTTP ${modelsRes.status}`);
  const models = await modelsRes.json().catch(() => ({}));
  const ids = (models.data || []).map(m => m.id);
  check(`model "${MODEL}" exists in /models`, ids.includes(MODEL), `${ids.length} models total`);

  // 3. Chat completion - same shape as charxi_online.html sendMessage():
  //    { model, messages: [{role:"system",content:role.prompt}, ...history] }
  //    (chat mode = full history; here: system + 1 user turn, max_tokens kept tiny for cost)
  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: "You are a helpful test assistant. Reply in one short sentence." },
      { role: "user", content: "Say hello and confirm you are working." },
    ],
    max_tokens: 60,
  };
  const chatRes = await fetch(`${OR}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "file://",
      "X-Title": "GoChat",
    },
    body: JSON.stringify(payload),
  });
  const chat = await chatRes.json().catch(() => ({}));
  check("POST /chat/completions returns 200", chatRes.ok, `HTTP ${chatRes.status}`);
  const reply = chat.choices?.[0]?.message?.content;
  check("chat reply is a non-empty string", typeof reply === "string" && reply.trim().length > 0);
  if (reply) console.log(`\nAPI reply: ${reply.trim()}\n`);
  if (!chatRes.ok) console.log("API error body:", JSON.stringify(chat).slice(0, 500));

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
