// Test delete role/story/persona functionality with .delete command and context menu
// Run: node tests/delete-role-story.test.js
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

const ROLE = { id: "r1", name: "Test Role", prompt: "You are a test role.", thumbUrl: "" };
const STORY = {
  id: "gist_story1",
  name: "Test Story",
  isStory: true,
  prompt: "Backstory content here",
  description: "Story description",
  thumbUrl: "",
  characters: [
    { id: "char_hero", name: "Hero", prompt: "Hero prompt", thumbUrl: "" },
    { id: "char_villain", name: "Villain", prompt: "Villain prompt", thumbUrl: "" },
  ],
  storyElements: [
    { id: "storyelement_castle", name: "Castle", prompt: "Castle prompt", thumbUrl: "" },
  ],
};
const PERSONA = { id: "p1", name: "Test Persona", prompt: "Persona description", imageDesc: "Image prompt", imageDataUrl: "" };

function gistFetchEmpty() {
  return async (url) => ({ ok: false, status: 404, json: async () => ({ files: {}, description: "" }), text: async () => "" });
}

function setupApp(seed) {
  const html = fs.readFileSync(APP, "utf8");
  const script = extractAppScript(html, path.dirname(APP));
  const app = bootApp({ html, script, fetchImpl: gistFetchEmpty(), seed });
  let downloadedBlob = null;
  app.ctx.URL = { createObjectURL(blob) { downloadedBlob = blob; return "blob:test"; }, revokeObjectURL() {} };
async function main() {
  /* ---------- Test 1: .delete yes (role) with backup ---------- */
  info("Test 1: .delete yes (role) with backup");
  let { app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([ROLE]),
    gochat_chats: JSON.stringify({ r1: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi there!" }] }),
    gochat_activeRoleId: "r1",
    gochat_mode: "chat",
  });
  let state = getState(app);
  check("role exists before delete", state.roles.find(r => r.id === "r1") !== undefined);
  check(".delete yes returns true", app.ctx.handleCommand(".delete yes") === true);
  state = getState(app);
  check("role removed from state.roles", state.roles.find(r => r.id === "r1") === undefined);
  check("chat removed from state.chats", state.chats.r1 === undefined);
  check("activeRoleId cleared", state.activeRoleId === null);
  let blob = getDownloadedBlob();
  check("backup blob created", blob !== null);
  if (blob) {
    const text = await blob.text();
    check("backup contains role type", text.includes("type: role"));
    check("backup contains role name", text.includes("name: Test Role"));
    check("backup contains prompt", text.includes("=== PROMPT ==="));
    check("backup contains chat history", text.includes("user -----------\nHello") && text.includes("assistant -----------\nHi there!"));
    const anchor = app.document.body.children[0];
    check("backup filename format", anchor.download.startsWith("role_Test_Role_") && anchor.download.endsWith(".txt"));
  }

  /* ---------- Test 2: .delete yes (role) nobackup ---------- */
  info("Test 2: .delete yes (role) nobackup");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([ROLE]),
    gochat_chats: JSON.stringify({ r1: [{ role: "user", content: "Hello" }] }),
    gochat_activeRoleId: "r1",
    gochat_mode: "chat",
  }));
  state = getState(app);
  check(".delete yes nobackup returns true", app.ctx.handleCommand(".delete yes nobackup") === true);
  state = getState(app);
  check("role removed", state.roles.find(r => r.id === "r1") === undefined);
  check("no backup downloaded", getDownloadedBlob() === null);

  /* ---------- Test 3: .delete yes (story) with backup ---------- */
  info("Test 3: .delete yes (story) with backup");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([STORY]),
    gochat_chats: JSON.stringify({
      "gist_story1::char_hero": [{ role: "user", content: "Hero user" }, { role: "assistant", content: "Hero assistant" }],
      "gist_story1::char_villain": [{ role: "assistant", content: "Villain assistant only" }],
      "gist_story1::storyelement_castle": [{ role: "user", content: "Castle user" }, { role: "assistant", content: "Castle assistant" }],
    }),
    gochat_activeRoleId: "gist_story1",
    gochat_mode: "story",
    gochat_storySelection: JSON.stringify({ storyId: "gist_story1", childId: "char_hero", kind: "character" }),
    gochat_storyUi: JSON.stringify({ "gist_story1": { expanded: true, lastChildId: "char_hero", lastKind: "character" } }),
  }));
  state = getState(app);
  check("story exists before delete", state.roles.find(r => r.id === "gist_story1") !== undefined);
  check(".delete yes returns true", app.ctx.handleCommand(".delete yes") === true);
  state = getState(app);
  check("story removed from state.roles", state.roles.find(r => r.id === "gist_story1") === undefined);
  check("all child chats removed", state.chats["gist_story1::char_hero"] === undefined && state.chats["gist_story1::char_villain"] === undefined && state.chats["gist_story1::storyelement_castle"] === undefined);
  check("activeRoleId cleared", state.activeRoleId === null);
  check("storySelection cleared", state.storySelection === null);
  check("storyUi cleared", state.storyUi["gist_story1"] === undefined);
  blob = getDownloadedBlob();
  check("backup blob created", blob !== null);
  if (blob) {
    const text = await blob.text();
    check("backup contains story type", text.includes("type: story"));
    check("backup contains story name", text.includes("name: Test Story"));
    check("backup contains backstory", text.includes("=== BACKSTORY ==="));
    check("backup contains description", text.includes("=== DESCRIPTION ==="));
    check("backup contains characters", text.includes("=== CHARACTERS ===") && text.includes("Hero") && text.includes("Villain"));
    check("backup contains story elements", text.includes("=== STORY ELEMENTS ===") && text.includes("Castle"));
    check("backup contains ASSISTANT-ONLY messages", text.includes("[Assistant messages") && text.includes("Hero assistant") && text.includes("Villain assistant only") && text.includes("Castle assistant"));
    check("backup does NOT contain user messages", !text.includes("Hero user") && !text.includes("Castle user"));
    const anchor = app.document.body.children[0];
/* ---------- Test 4: .delete yes (story) nobackup ---------- */
  info("Test 4: .delete yes (story) nobackup");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([STORY]),
    gochat_chats: JSON.stringify({ "gist_story1::char_hero": [{ role: "assistant", content: "Test" }] }),
    gochat_activeRoleId: "gist_story1",
    gochat_mode: "story",
  }));
  state = getState(app);
  check(".delete yes nobackup returns true", app.ctx.handleCommand(".delete yes nobackup") === true);
  state = getState(app);
  check("story removed", state.roles.find(r => r.id === "gist_story1") === undefined);
  check("no backup downloaded", getDownloadedBlob() === null);

  /* ---------- Test 5: .delete persona yes with backup ---------- */
  info("Test 5: .delete persona yes with backup");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_personas: JSON.stringify([PERSONA]),
    gochat_activePersonaId: "p1",
  }));
  state = getState(app);
  check("persona exists before delete", state.personas.find(p => p.id === "p1") !== undefined);
  check(".delete persona yes returns true", app.ctx.handleCommand(".delete persona yes") === true);
  state = getState(app);
  check("persona removed from state.personas", state.personas.find(p => p.id === "p1") === undefined);
  check("activePersonaId cleared", state.activePersonaId === null);
  blob = getDownloadedBlob();
  check("backup blob created", blob !== null);
  if (blob) {
    const text = await blob.text();
    check("backup contains persona type", text.includes("type: persona"));
    check("backup contains persona name", text.includes("name: Test Persona"));
    check("backup contains description", text.includes("=== DESCRIPTION ==="));
    check("backup contains image prompt", text.includes("=== IMAGE PROMPT ==="));
    const anchor = app.document.body.children[0];
    check("backup filename format", anchor.download.startsWith("persona_Test_Persona_") && anchor.download.endsWith(".txt"));
  }

  /* ---------- Test 6: .delete persona yes nobackup ---------- */
  info("Test 6: .delete persona yes nobackup");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_personas: JSON.stringify([PERSONA]),
    gochat_activePersonaId: "p1",
  }));
  state = getState(app);
  check(".delete persona yes nobackup returns true", app.ctx.handleCommand(".delete persona yes nobackup") === true);
  state = getState(app);
  check("persona removed", state.personas.find(p => p.id === "p1") === undefined);
  check("no backup downloaded", getDownloadedBlob() === null);

  /* ---------- Test 7: Error cases ---------- */
  info("Test 7: Error cases");
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([]),
    gochat_mode: "chat",
  }));
  check(".delete without args shows usage", !app.ctx.handleCommand(".delete"));
  check(".delete invalid shows usage", !app.ctx.handleCommand(".delete maybe"));
  check(".delete persona without yes shows usage", !app.ctx.handleCommand(".delete persona"));
  check(".delete persona no shows usage", !app.ctx.handleCommand(".delete persona no"));
  check(".delete with no active role shows error", !app.ctx.handleCommand(".delete yes"));

  /* ---------- Test 8: Other roles/stories untouched ---------- */
  info("Test 8: Other roles/stories untouched");
  const ROLE2 = { id: "r2", name: "Role Two", prompt: "Prompt two", thumbUrl: "" };
  ({ app, getDownloadedBlob, clearDownloadedBlob } = setupApp({
    gochat_apiKey: "sk-or-v1-testkey",
    gochat_model: "test/model",
    gochat_roles: JSON.stringify([ROLE, ROLE2]),
    gochat_chats: JSON.stringify({ r1: [{ role: "user", content: "Hi" }], r2: [{ role: "user", content: "Hi2" }] }),
    gochat_activeRoleId: "r1",
    gochat_mode: "chat",
  }));
  state = getState(app);
  app.ctx.handleCommand(".delete yes");
  state = getState(app);
  check("role r1 deleted", state.roles.find(r => r.id === "r1") === undefined);
  check("role r2 still exists", state.roles.find(r => r.id === "r2") !== undefined);
  check("role r2 chat intact", state.chats.r2 && state.chats.r2.length === 1);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
    check("backup filename format", anchor.download.startsWith("story_Test_Story_") && anchor.download.endsWith(".txt"));
  }
  return { app, getDownloadedBlob: () => downloadedBlob, clearDownloadedBlob: () => { downloadedBlob = null; } };
}

function getState(app) {
  return vm.runInContext("state", app.ctx);
}
