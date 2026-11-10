// Verifies the Persona Maker page: templates load as web resources,
// personas read from localStorage, AI Enhance rewrites the description
// from the selected template and generates the Perchance prompt with the
// default chat model, Undo restores the pre-enhance description, Clear
// resets the form, and images are always resized to 450x450.
// Run: node tests/persona-maker.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { CHAT_DIR, extractAppScript, loadPageCss, bootApp, readKey } = require("./dom-shim");

const MAKER_HTML = path.join(CHAT_DIR, "persona_maker.html");
const TEMPLATES_DIR = path.join(CHAT_DIR, "persona_templates");
const OR_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const ENHANCED = "Name: Aiko\nArchetype: Assistant";
const IMAGE_PROMPT = "Waist-up portrait of a smiling attractive woman, drawn anime, square, clean background.";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}
function info(name, extra = "") { console.log(`INFO  ${name}${extra ? " — " + extra : ""}`); }

function stubChatFetch(replies, tplFiles = {}) {
  const calls = [];
  const chatCalls = [];
  let chatIdx = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith("persona_templates/")) {
      const file = path.basename(u);
      if (tplFiles[file] != null) return { ok: true, status: 200, text: async () => tplFiles[file] };
      return { ok: false, status: 404, text: async () => "" };
    }
    const body = init.body ? JSON.parse(init.body) : null;
    chatCalls.push({ url: u, init, body });
    const content = replies[chatIdx++] || "";
    return {
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content } }], usage: {} }),
      text: async () => "",
    };
  };
  return { calls, chatCalls, fetchImpl };
}

async function main() {
  const html = fs.readFileSync(MAKER_HTML, "utf8");
  const makerScript = extractAppScript(html, path.dirname(MAKER_HTML));
  const css = loadPageCss(html, path.dirname(MAKER_HTML));
  const tplFiles = {};
  for (const f of fs.readdirSync(TEMPLATES_DIR)) tplFiles[f] = fs.readFileSync(path.join(TEMPLATES_DIR, f), "utf8");

  /* 1. Static markup + shared styling */
  check("page links shared charxi css", /href="charxi_online\.css/.test(html));
  check("css defines the theme tokens", /--acc:#6c5cff/.test(css) && /--bg:#0f1115/.test(css));
  check("label is Template (not Role Template)", /<label for="templateSel">Template<\/label>/.test(html));
  check("no Role Template label", !/Role Template/.test(html));
  check("no 'Use Template' button", !/loadTplBtn|Use Template/.test(html));
  check("Preview button exists", /id="previewTemplateBtn"/.test(html));
  check("Width/Height inputs removed", !/id="imgW"|id="imgH"/.test(html));
  check("AI Enhance exists", /id="enhanceBtn"/.test(html));
  check("Copy Prompt button copies prompt", /id="copyPerchanceBtn"[^>]*>Copy Prompt<\/button>/.test(html));
  check("no Paste Image button", !/id="pasteImageBtn"|Paste Image<\/button>/.test(html));
  check("Upload Image button allows disk upload", />Upload Image<\/button>/.test(html) && /id="imageUploadInput"[^>]*accept="image\/\*"/.test(html));
  check("Back to Chat has no leading glyph", />Back to Chat<\/button>/.test(html));
  check("Perchance note is plain (no boxed div)", !/class="perchanceInfo"/.test(html) && /Generate image at/.test(html));
  check("no legacy script deps", !/persona_maker\.js\?v=1|charxi_online\.js/.test(html));

  /* 2. Boot: template dropdown + persona dropdown from localStorage */
  const personaSeed = JSON.stringify([
    { id: "p1", name: "Aiko", prompt: "Aiko is a helpful assistant.", imageDesc: "old prompt", imageDataUrl: "" },
    { id: "p2", name: "Kai", prompt: "Kai is a quiet friend.", imageDesc: "", imageDataUrl: "" },
  ]);
  const replies = [ENHANCED, IMAGE_PROMPT];
  const s0 = stubChatFetch(replies, tplFiles);
  const app0 = bootApp({ html, script: makerScript, fetchImpl: s0.fetchImpl,
    seed: { gochat_personas: personaSeed, gochat_apiKey: "sk-or-v1-testkey", gochat_model: "test/model" } });

  const tplSel = app0.els.get("templateSel");
  check("template dropdown populated (No template + 2)", tplSel.children.length === 3, String(tplSel.children.length));
  check("template labels shown", tplSel.children.map(o => o.textContent).join("|") === "No template|Basic User Template|User Persona Template",
    tplSel.children.map(o => o.textContent).join("|"));
  check("template values are web-relative file names", tplSel.children.map(o => o.value).join(",") === ",basic_user_template.txt,user_persona_template.txt");

  const perSel = app0.els.get("personaSel");
  check("persona dropdown reads localStorage personas", perSel.children.map(o => o.textContent).join("|") === "Select or create a persona...|Aiko|Kai",
    perSel.children.map(o => o.textContent).join("|"));

  /* 3. Selecting a persona preloads name/desc; Preview shows template text */
  perSel.value = "p1";
  perSel.dispatch("change");
  check("select loads persona name", app0.els.get("personaName").value === "Aiko");
  check("select loads persona description", app0.els.get("personaDesc").value === "Aiko is a helpful assistant.");
  check("select loads perchance prompt", app0.els.get("perchancePrompt").value === "old prompt");

  tplSel.value = "basic_user_template.txt";
  await vm.runInContext("pmPreviewTemplate()", app0.ctx);
  check("preview fetched template as web resource", s0.calls.some(c => c.url.startsWith("persona_templates/basic_user_template.txt")));
  check("preview shows template contents", app0.els.get("templatePreview").textContent === tplFiles["basic_user_template.txt"]);
  check("preview panel visible", app0.els.get("templatePreview").classList.contains("show"));

  tplSel.value = "user_persona_template.txt";
  await vm.runInContext("pmPreviewTemplate()", app0.ctx);
  check("second template previewed", app0.els.get("templatePreview").textContent === tplFiles["user_persona_template.txt"]);

  /* 4. AI Enhance with a template: uses the default chat model twice */
  app0.els.get("personaName").value = "Aiko";
  app0.els.get("personaDesc").value = "Aiko is a friendly assistant who likes tea.";
  app0.els.get("templateSel").value = "user_persona_template.txt";
  await vm.runInContext("pmAiEnhance()", app0.ctx);
  const chatCalls = s0.chatCalls;
  check("AI Enhance made 2 chat calls", chatCalls.length === 2, String(chatCalls.length));
  check("AI Enhance uses the saved default chat model", chatCalls.every(c => c.body && c.body.model === "test/model"));
  check("first call embeds the template", chatCalls[0].body.messages[1].content.includes(tplFiles["user_persona_template.txt"]));
  check("first call embeds the user description", chatCalls[0].body.messages[1].content.includes("Aiko is a friendly assistant who likes tea."));
  check("first call invents missing fields", /Make things up to fill every field|Invent plausible details/i.test(chatCalls[0].body.messages[0].content));
  check("first call never writes Not specified", !/If the description does not cover a field, write 'Not specified'/.test(chatCalls[0].body.messages[0].content));
  check("first call infers gender from name", /infer it from the user's given name|recognisable first name/i.test(chatCalls[0].body.messages[0].content));
  check("description rewritten to enhanced text", app0.els.get("personaDesc").value === ENHANCED);
  check("perchance prompt generated from enhanced description", app0.els.get("perchancePrompt").value === IMAGE_PROMPT);
  check("image prompt bases on enhanced text", chatCalls[1].body.messages[1].content.includes("Name: Aiko"));
  check("prompt enforces smiling waist-up portrait", /waist-up portrait of the person smiling and attractive/i.test(chatCalls[1].body.messages[0].content));

  /* 5. Undo restores the pre-enhance description (and prior prompt) */
  app0.els.get("undoPersonaBtn").dispatch("click");
  check("undo restores original description", app0.els.get("personaDesc").value === "Aiko is a friendly assistant who likes tea.");
  check("undo restores prior perchance prompt", app0.els.get("perchancePrompt").value === "old prompt");

  /* 6. Save: writes gochat_personas in the chat shape; validation */
  app0.els.get("personaName").value = "";
  await vm.runInContext("pmSavePersona()", app0.ctx);
  check("save rejects missing name", /persona name first/i.test(app0.els.get("makerMsg").textContent));
  app0.els.get("personaName").value = "Aiko";
  app0.els.get("personaDesc").value = ENHANCED;
  app0.els.get("perchancePrompt").value = IMAGE_PROMPT;
  await vm.runInContext("pmSavePersona()", app0.ctx);
  const saved = JSON.parse(app0.localStorage.getItem("gochat_personas"));
  check("save stores persona in chat shape", saved.length === 2 && saved[0].id === "p1" && saved[0].name === "Aiko" && saved[0].prompt === ENHANCED && saved[0].imageDesc === IMAGE_PROMPT, JSON.stringify(saved.map(s => s.name)));

  /* 7. Clear resets the form (saved personas untouched) */
  await vm.runInContext("pmClearForm()", app0.ctx);
  check("clear blanks the form", app0.els.get("personaName").value === "" && app0.els.get("personaDesc").value === "" && app0.els.get("templateSel").value === "" && app0.els.get("perchancePrompt").value === "");
  check("clear hides template preview", !app0.els.get("templatePreview").classList.contains("show"));
  check("clear leaves saved personas alone", JSON.parse(app0.localStorage.getItem("gochat_personas")).length === 2);

  /* 8. New persona (blank dropdown + typed name) */
  app0.els.get("personaSel").value = "";
  app0.els.get("personaName").value = "Kai";
  app0.els.get("personaDesc").value = "Kai is quiet.";
  app0.els.get("perchancePrompt").value = "";
  await vm.runInContext("pmSavePersona()", app0.ctx);
  const afterNew = JSON.parse(app0.localStorage.getItem("gochat_personas"));
  check("blank selection + typed name creates a new persona", afterNew.length === 3 && afterNew.some(p => p.name === "Kai" && p.prompt === "Kai is quiet."), JSON.stringify(afterNew.map(p => p.name)));


  /* 9. Image resize: square crop to 450x450 (simulated paste path) */
  const canvasCalls = [];
  class ImgStub { constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 800; this.naturalHeight = 600; this.width = 800; this.height = 600; }
    set src(v) { this._src = v; if (this.onload) queueMicrotask(() => this.onload()); }
    get src() { return this._src; } }
  app0.ctx.Image = ImgStub;
  app0.ctx.FileReader = class { readAsDataURL(f) { this.result = "data:image/png;base64,AAAA"; queueMicrotask(() => this.onload && this.onload()); } };
  const canvasStub = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...a) => canvasCalls.push(a) }),
    toDataURL: () => "data:image/jpeg;base64," + "x".repeat(200),
  };
  const origCreate = app0.ctx.document.createElement;
  app0.ctx.document.createElement = (t) => t === "canvas" ? canvasStub : origCreate(t);
  await vm.runInContext(`pmApplyImageBlob({ type: "image/png", size: 1024 }, "uploaded")`, app0.ctx);
  check("image resize draws a square crop", canvasCalls.length === 1 && canvasCalls[0][3] === canvasCalls[0][4] && canvasCalls[0][7] === 450 && canvasCalls[0][8] === 450);
  check("resized canvas is 450x450", canvasStub.width === 450 && canvasStub.height === 450);
  check("preview set from resized data url", String(app0.els.get("imgPreview").src || "").startsWith("data:image/jpeg;base64,"));
  check("meta states 450x450 + upload", /450x450/.test(app0.els.get("imgMeta").textContent) && /uploaded/.test(app0.els.get("imgMeta").textContent));

  app0.els.get("clearImageBtn").dispatch("click");
  check("clear image empties preview", !app0.els.get("imgPreview").classList.contains("show") && app0.els.get("imgMeta").textContent === "");

  /* 10. Guard rails */
  const s1 = stubChatFetch([], tplFiles);
  const app1 = bootApp({ html, script: makerScript, fetchImpl: s1.fetchImpl, seed: { gochat_personas: "[]" } });
  app1.els.get("personaDesc").value = "Some description";
  await vm.runInContext("pmAiEnhance()", app1.ctx);
  check("AI Enhance without key/model fails cleanly", /No chat API key\/model/.test(app1.els.get("makerMsg").textContent));

  /* 11. Live check (key never printed) */
  let key = null, model = "openrouter/free";
  try { ({ key, model } = readKey()); } catch (e) { info("live check skipped (no key file)"); }
  if (key) {
    const keyId = crypto.createHash("sha256").update(key).digest("hex").slice(0, 10);
    console.log(`\nLive check — key from tools/openrouter_api_key.txt (sha256 ${keyId}…, ${key.length} chars, model: ${model})`);
    check("key looks like an OpenRouter key", key.startsWith("sk-or-"));
    const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${key}` } });
    check("GET /auth/key returns 200", authRes.ok, `HTTP ${authRes.status}`);
    if (authRes.ok) {
      const modelsRes = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      const models = ((await modelsRes.json()).data || []);
      const free = models.filter(m => Number(m.pricing && m.pricing.prompt) === 0).map(m => m.id).sort();
      info("free models available", String(free.length));
      if (free.length) {
        let chat = null, chatRes = null, lastModel = "";
        for (const model of free.slice(0, 3)) {
          lastModel = model;
          chatRes = await fetch(OR_CHAT_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "file:///", "X-Title": "GoChat" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with just: ok" }], max_tokens: 10 }),
          });
          chat = await chatRes.json().catch(() => ({}));
          if (chatRes.ok && chat.choices?.[0]?.message?.content?.trim()) break;
        }
        if (chatRes && chatRes.ok) {
          check("POST /chat/completions returns 200 (enhance path)", true, `model ${lastModel}`);
          const reply = chat?.choices?.[0]?.message?.content;
          check("chat reply is a non-empty string", typeof reply === "string" && reply.trim().length > 0, reply ? String(reply).slice(0, 40) : JSON.stringify(chat).slice(0, 120));
        } else {
          // Free-tier provider throttling (429) is not an app failure — the
          // endpoint and key are already proven by the 200s above.
          info("live completion throttled by free provider (HTTP " + (chatRes && chatRes.status) + ") — skipping strict reply check");
        }
      } else {
        info("no free models — skipping live completion");
      }
    }
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });

