"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { APP, extractAppScript, bootApp } = require("./dom-shim");

async function main() {
  const html = fs.readFileSync(APP, "utf8");
  const app = bootApp({ html, script: extractAppScript(html, path.dirname(APP)) });
  let downloadedBlob = null;
  app.ctx.URL = {
    createObjectURL(blob) { downloadedBlob = blob; return "blob:test"; },
    revokeObjectURL() {},
  };
  const role = {
    id: "gist_0123456789abcdef0123456789abcdef",
    sourceGist: "0123456789abcdef0123456789abcdef",
    gistUrl: "https://gist.github.com/0123456789abcdef0123456789abcdef",
    name: "Test role",
  };
  app.ctx.seedChatBackup = role;
  app.ctx.seedChatBackupMessages = [
    { role: "user", content: "hello", ts: 1 },
    { role: "assistant", content: "hey how's it going", ts: 2 },
  ];
  require("vm").runInContext(
    "state.roles=[seedChatBackup];state.activeRoleId=seedChatBackup.id;" +
    "state.chats[state.activeRoleId]=seedChatBackupMessages",
    app.ctx,
  );

  assert.strictEqual(app.ctx.chatBackup(), true);
  assert(downloadedBlob, "backup creates a download");
  assert.strictEqual(downloadedBlob.type, "text/plain;charset=utf-8");
  const anchor = app.document.body.children[0];
  assert(anchor.download.endsWith(".txt"), anchor.download);
  assert(anchor.download.startsWith("chat_https___gist_github_com_0123456789abcdef0123456789abcdef_"), anchor.download);
  assert.strictEqual(await downloadedBlob.text(),
    "gist_url:[https://gist.github.com/0123456789abcdef0123456789abcdef]\n\n" +
    "user -----------\nhello\n\n" +
    "assistant -----------\nhey how's it going\n");

  assert.strictEqual(app.ctx.handleCommand(".clear"), true);
  assert.strictEqual(await downloadedBlob.text(),
    "gist_url:[https://gist.github.com/0123456789abcdef0123456789abcdef]\n\n" +
    "user -----------\nhello\n\n" +
    "assistant -----------\nhey how's it going\n");
  assert.strictEqual(require("vm").runInContext("currentHistory().length", app.ctx), 0);

  require("vm").runInContext(
    "state.chats[state.activeRoleId]=seedChatBackupMessages",
    app.ctx,
  );
  const previousDownload = downloadedBlob;
  assert.strictEqual(app.ctx.handleCommand(".clear noback"), true);
  assert.strictEqual(downloadedBlob, previousDownload, ".clear noback skips the download");
  assert.strictEqual(require("vm").runInContext("currentHistory().length", app.ctx), 0);

  console.log("All chat backup checks passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
