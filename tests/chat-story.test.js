// Verifies the Chat / Story sidebar: heading follows mode, roles show only
// in Chat, stories show only in Story, a story expands to its characters
// and story elements (indented), and expansion + selection persist.
// Run: node tests/chat-story.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { APP, extractAppScript, loadPageCss, bootApp } = require("./dom-shim");

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}
function info(name, extra = "") { console.log(`INFO  ${name}${extra ? " — " + extra : ""}`); }

const STORY = {
  id: "gist_ae5ed1170352b40652205083d75ceda0",
  name: "Dax And Gemma",
  isStory: true,
  prompt: "",
  description: "Dax and Gemma story.",
  thumbUrl: "https://example.com/story.jpg",
  characters: [
    { id: "char_dax_gunderson", name: "Dax Gunderson", prompt: "Dax is 6'2\" tall and blonde", thumbUrl: "https://example.com/dax.jpg" },
    { id: "char_gemma_diamond", name: "Gemma Diamond", prompt: "Gemma is a cute girl", thumbUrl: "https://example.com/gemma.jpg" },
  ],
  storyElements: [
    { id: "storyelement_gemmas_house", name: "Gemmas House", prompt: "Something goes here", thumbUrl: "" },
    { id: "storyelement_the_consulate", name: "The Consulate", prompt: "something goes here not sure", thumbUrl: "" },
  ],
};
const ROLE = { id: "r1", name: "Chat Role", prompt: "You are a test role.", thumbUrl: "" };

function gistFetchOur(files, description) {
  return async (url) => {
    const u = String(url);
    if (u.startsWith("https://api.github.com/gists/")) {
      const map = {};
      files.forEach(f => { map[f.filename] = { filename: f.filename, content: f.content, raw_url: "https://raw.example/" + f.filename, truncated: false }; });
      return { ok: true, status: 200, json: async () => ({ files: map, description: description || "" }) };
    }
    if (u.startsWith("https://raw.example/")) {
      const name = decodeURIComponent(u.split("/").pop());
      const found = files.find(f => f.filename === name);
      return { ok: true, status: 200, text: async () => (found ? found.content : "") };
    }
    return { ok: false, status: 404, text: async () => "" };
  };
}

async function main() {
  const html = fs.readFileSync(APP, "utf8");
  const script = extractAppScript(html, path.dirname(APP));
  const css = loadPageCss(html, path.dirname(APP));

  check("page title is Character XI Chat", /<title>Character XI Chat<\/title>/.test(html));
  check("setup heading is Character XI Setup", /<h1>⚙️ Character XI Setup<\/h1>/.test(html));
  check("Personas tab starts hidden", /class="sideTab hidden" id="tabPersonas"/.test(html));
  check("sidebar title starts as Chat", /<h2 id="sidebarTitle">🧑‍🎭 Chat<\/h2>/.test(html));
  check("sidebar tab starts as Chat", /id="tabRoles"[^>]*>🧑‍🎭 Chat<\/button>/.test(html));
  check("story list container exists", /id="storyList"/.test(html));
  check("story list starts hidden", /id="storyList" class="hidden"/.test(html));
  check("css expands story children", /\.storyGroup\.expanded \.storyChildren/.test(css));
  check("characters keep a fallback circle", /\.storyChild \.avaFallback/.test(css) && /class="avaFallback"/.test(script));

  const storyFiles = [
    { filename: "GOCHATAPPSTORYTAG_dax_and_gemma.md", content: "story\n" },
    { filename: "character_dax_gunderson.txt", content: "Dax is 6'2\" tall and blonde" },
    { filename: "character_gemma_diamond.txt", content: "Gemma is a cute girl" },
    { filename: "dax_gunderson_thumb.md", content: '<img src="https://example.com/dax.jpg" />' },
    { filename: "gemma_diamond_thumb.md", content: '<img src="https://example.com/gemma.jpg" />' },
    { filename: "storyelement_gemmas_house.txt", content: "Something goes here i'm not sure what" },
    { filename: "storyelement_the_consulate.txt", content: "something goes here not sure" },
    { filename: "thumb.md", content: '<img width="450" height="450" src="https://example.com/story.jpg" />' },
  ];
  const seedReady = { gochat_apiKey: "sk-or-v1-testkey", gochat_model: "test/model", gochat_roles: "[]", gochat_activeRoleId: "" };

  const probe = bootApp({ html, script, fetchImpl: gistFetchOur(storyFiles, "Dax and Gemma description"), seed: seedReady });
  const parsed = await vm.runInContext("fetchRoleFromGist('https://gist.github.com/gochatapp/ae5ed1170352b40652205083d75ceda0')", probe.ctx);
  check("story gist detected as story", parsed && parsed.isStory === true);
  check("story name from tag file with each word title-cased", parsed && parsed.name === "Dax And Gemma", parsed && parsed.name);
  check("story description captured", parsed && parsed.description === "Dax and Gemma description");
  check("story thumbnail from thumb.md", parsed && parsed.thumbUrl === "https://example.com/story.jpg");
  check("backstory-less story has empty backstory", parsed && parsed.prompt === "");
  check("story has 2 characters", parsed && parsed.characters.length === 2, parsed && parsed.characters.map(c => c.name).join(","));
  check("story has 2 story elements", parsed && parsed.storyElements.length === 2, parsed && parsed.storyElements.map(e => e.name).join(","));
  check("character thumbnail from <slug>_thumb.md", parsed && parsed.characters.find(c => c.id === "char_dax_gunderson") && parsed.characters.find(c => c.id === "char_dax_gunderson").thumbUrl === "https://example.com/dax.jpg", parsed && parsed.characters.find(c => c.id === "char_dax_gunderson") && parsed.characters.find(c => c.id === "char_dax_gunderson").thumbUrl);
  check("character Gemma thumbnail loaded", parsed && parsed.characters.find(c => c.id === "char_gemma_diamond") && parsed.characters.find(c => c.id === "char_gemma_diamond").thumbUrl === "https://example.com/gemma.jpg");
  check("character prompt loaded", parsed && parsed.characters.find(c => c.id === "char_dax_gunderson") && parsed.characters.find(c => c.id === "char_dax_gunderson").prompt.includes("Dax is"));
  check("story element prompt loaded", parsed && parsed.storyElements.find(e => e.id === "storyelement_gemmas_house") && parsed.storyElements.find(e => e.id === "storyelement_gemmas_house").prompt.includes("Something"));

  const bad = bootApp({ html, script, fetchImpl: gistFetchOur([{ filename: "GOCHATAPPSTORYTAG_dax.md", content: "not-story" }], ""), seed: seedReady });
  let badError = null;
  try { await vm.runInContext("fetchRoleFromGist('https://gist.github.com/gochatapp/0123456789abcdef0123456789abcdef')", bad.ctx); } catch (e) { badError = e; }
  check("non-story tag content rejected", !!badError && /must contain just 'story' or start with 'backstory'/.test(badError.message), badError && badError.message);

  const backstoryFiles = [
    { filename: "GOCHATAPPSTORYTAG_dax_and_gemma.md", content: "backstory if any\n" },
    { filename: "character_dax_gunderson.txt", content: "Dax is 6'2\" tall and blonde" },
    { filename: "character_gemma_diamond.txt", content: "Gemma is a cute girl" },
    { filename: "dax_gunderson_thumb.md", content: '<img src="https://gist.github.com/user-attachments/assets/dax" />' },
    { filename: "gemma_diamond_thumb.md", content: '<img src="https://gist.github.com/user-attachments/assets/gemma" />' },
    { filename: "storyelement_gemmas_house.txt", content: "Something goes here i'm not sure what" },
    { filename: "storyelement_the_consulate.txt", content: "something goes here not sure" },
  ];
  const backstoryProbe = bootApp({ html, script, fetchImpl: gistFetchOur(backstoryFiles, "Dax and Gemma description"), seed: seedReady });
  const backstoryParsed = await vm.runInContext("fetchRoleFromGist('https://gist.github.com/gochatapp/ae5ed1170352b40652205083d75ceda0')", backstoryProbe.ctx);
  check("live gist with 'backstory if any' loads as story", backstoryParsed && backstoryParsed.isStory === true);
  check("'backstory if any' yields empty backstory", backstoryParsed && backstoryParsed.prompt === "", backstoryParsed && backstoryParsed.prompt);
  check("live character thumbnail loaded", backstoryParsed && backstoryParsed.characters.find(c => c.id === "char_dax_gunderson") && /assets\/dax/.test(backstoryParsed.characters.find(c => c.id === "char_dax_gunderson").thumbUrl));
  check("second character thumbnail loaded", backstoryParsed && backstoryParsed.characters.find(c => c.id === "char_gemma_diamond") && /assets\/gemma/.test(backstoryParsed.characters.find(c => c.id === "char_gemma_diamond").thumbUrl));
  check("missing story thumb.md is empty, not an error", backstoryParsed && backstoryParsed.thumbUrl === "");

  const textBackstoryProbe = bootApp({ html, script, fetchImpl: gistFetchOur([{ filename: "GOCHATAPPSTORYTAG_dax.md", content: "backstory: Dax and Gemma met in college." }, { filename: "character_dax.txt", content: "Dax" }], ""), seed: seedReady });
  const textBackstory = await vm.runInContext("fetchRoleFromGist('https://gist.github.com/gochatapp/0123456789abcdef0123456789abcdef')", textBackstoryProbe.ctx);
  check("backstory text after the keyword is captured", textBackstory && textBackstory.prompt === "Dax and Gemma met in college.", textBackstory && textBackstory.prompt);

  const app = bootApp({
    html, script, fetchImpl: gistFetchOur([], ""),
    seed: {
      gochat_apiKey: "sk-or-v1-testkey",
      gochat_model: "test/model",
      gochat_roles: JSON.stringify([STORY, ROLE]),
      gochat_activeRoleId: "r1",
      gochat_mode: "chat",
      gochat_sidebarTab: "roles",
    },
  });
  const run = (expr) => vm.runInContext(expr, app.ctx);
  check("chat mode heading is Chat", app.document.getElementById("sidebarTitle").textContent === "🧑‍🎭 Chat", app.document.getElementById("sidebarTitle").textContent);
  check("chat mode shows the Personas tab", !app.document.getElementById("tabPersonas").classList.contains("hidden"));
  check("chat mode: currentPersona resolves", run("currentPersona()") === null || typeof run("currentPersona()") === "object");
  check("chat mode tab is Chat", app.document.getElementById("tabRoles").textContent === "🧑‍🎭 Chat");
  check("chat mode shows the role list", !app.document.getElementById("roleList").classList.contains("hidden"));
  check("chat mode hides the story list", app.document.getElementById("storyList").classList.contains("hidden"));
  check("chat list shows the role only", /Chat Role/.test(app.document.getElementById("roleList").innerHTML), app.document.getElementById("roleList").innerHTML.slice(0, 200));

  run("setMode('story')");
  check("story mode heading is Story", app.document.getElementById("sidebarTitle").textContent === "📖 Story", app.document.getElementById("sidebarTitle").textContent);
  check("story mode hides the Personas tab", app.document.getElementById("tabPersonas").classList.contains("hidden"));
  check("story mode: personasAvailable() is false", run("personasAvailable()") === false);
  check("story mode: currentPersona() is null", run("currentPersona()") === null);
  check("story mode: cannot select a persona", run("selectPersona('p1')") === false);
  check("story mode shows the story list", !app.document.getElementById("storyList").classList.contains("hidden"));
  check("story mode shows the story with its image", /Dax And Gemma/.test(app.document.getElementById("storyList").innerHTML) && /story\.jpg/.test(app.document.getElementById("storyList").innerHTML) && !/Dax and Gemma story\./.test(app.document.getElementById("storyList").innerHTML), app.document.getElementById("storyList").innerHTML.slice(0, 240));

  const groupBefore = app.document.getElementById("storyList").children[0];
  check("story starts collapsed", !groupBefore.classList.contains("expanded"), groupBefore.className);
  groupBefore.querySelector(".storyItem").click();
  const groupAfter = app.document.getElementById("storyList").children[0];
  check("clicking the story expands it", groupAfter.classList.contains("expanded"));
  check("expanded state saved", run("isStoryExpanded('gist_ae5ed1170352b40652205083d75ceda0')") === true);
  const childEls = app.document.getElementById("storyList").querySelectorAll(".storyChild");
  check("expanded story renders 4 indented children", childEls.length === 4, String(childEls.length));

  const dax = childEls.find(el => el.dataset.childId === "char_dax_gunderson");
  check("character with an image shows the image instead of a fallback circle", !!dax && /dax\.jpg/.test(dax.innerHTML) && !/avaFallback/.test(dax.innerHTML), dax && dax.innerHTML.slice(0, 160));
  dax.click();
  check("clicking a character opens its own chat", run("activeChatId()") === "gist_ae5ed1170352b40652205083d75ceda0::char_dax_gunderson", run("activeChatId()"));
  const ui = JSON.parse(app.localStorage.getItem("gochat_storyUi") || "{}");
  check("selecting a character writes the story status", !!(ui && ui["gist_ae5ed1170352b40652205083d75ceda0"] && ui["gist_ae5ed1170352b40652205083d75ceda0"].lastChildId === "char_dax_gunderson"));
  const sel = JSON.parse(app.localStorage.getItem("gochat_storySelection") || "null");
  check("selecting a character writes the selection", !!(sel && sel.childId === "char_dax_gunderson" && sel.kind === "character"));
  check("header shows character · story", app.document.getElementById("hdrName").textContent === "Dax Gunderson · Dax And Gemma", app.document.getElementById("hdrName").textContent);

  run("setMode('chat')");
  check("chat heading returns", app.document.getElementById("sidebarTitle").textContent === "🧑‍🎭 Chat");
  check("chat mode: Personas tab returns", !app.document.getElementById("tabPersonas").classList.contains("hidden"));
  check("chat mode: personasAvailable() is true", run("personasAvailable()") === true);
  check("chat selection survives leaving story mode", run("activeChatId()") === "gist_ae5ed1170352b40652205083d75ceda0::char_dax_gunderson");

  const app2 = bootApp({
    html, script, fetchImpl: gistFetchOur([], ""),
    seed: {
      gochat_apiKey: "sk-or-v1-testkey",
      gochat_model: "test/model",
      gochat_roles: JSON.stringify([STORY, ROLE]),
      gochat_activeRoleId: "gist_ae5ed1170352b40652205083d75ceda0",
      gochat_mode: "story",
      gochat_sidebarTab: "roles",
      gochat_storyUi: JSON.stringify({ "gist_ae5ed1170352b40652205083d75ceda0": { expanded: true, lastChildId: "char_dax_gunderson", lastKind: "character" } }),
      gochat_storySelection: JSON.stringify({ storyId: "gist_ae5ed1170352b40652205083d75ceda0", childId: "storyelement_gemmas_house", kind: "storyelement" }),
    },
  });
  const run2 = (expr) => vm.runInContext(expr, app2.ctx);
  const restored = app2.document.getElementById("storyList").children[0];
  check("returning to a story restores its expanded state", !!restored && restored.classList.contains("expanded"));
  check("returning to a story restores its active child", run2("activeChatId()") === "gist_ae5ed1170352b40652205083d75ceda0::storyelement_gemmas_house", run2("activeChatId()"));
  const activeChild = app2.document.getElementById("storyList").querySelectorAll(".storyChild").find(el => el.classList.contains("active"));
  check("active story element row is highlighted", !!activeChild && activeChild.dataset.childId === "storyelement_gemmas_house", activeChild && activeChild.dataset.childId);

  const elementApp = bootApp({
    html, script, fetchImpl: gistFetchOur([], ""),
    seed: {
      gochat_apiKey: "sk-or-v1-testkey",
      gochat_model: "test/model",
      gochat_roles: JSON.stringify([STORY, ROLE]),
      gochat_activeRoleId: "gist_ae5ed1170352b40652205083d75ceda0",
      gochat_mode: "story",
      gochat_sidebarTab: "roles",
      gochat_storyUi: JSON.stringify({ "gist_ae5ed1170352b40652205083d75ceda0": { expanded: true, lastChildId: "char_dax_gunderson", lastKind: "character" } }),
      gochat_storySelection: JSON.stringify({ storyId: "gist_ae5ed1170352b40652205083d75ceda0", childId: "storyelement_gemmas_house", kind: "storyelement" }),
    },
  });
  const elementRun = (expr) => vm.runInContext(expr, elementApp.ctx);
  check("story element selection is active", elementRun("activeChatId()") === "gist_ae5ed1170352b40652205083d75ceda0::storyelement_gemmas_house", elementRun("activeChatId()"));
  check("story element prompt is labelled as a story element", /Story element — Gemmas House/.test(elementRun("sysStoryPrompt(currentRole(),currentStoryChild().child).prompt")), elementRun("sysStoryPrompt(currentRole(),currentStoryChild().child).prompt").split("\n\n")[0]);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e && e.stack || e); process.exit(1); });

