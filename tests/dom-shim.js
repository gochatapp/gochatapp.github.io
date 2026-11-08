// Shared minimal DOM/browser shim so the app's real script (charxi_online.js) can be executed
// under Node — no jsdom, no dependencies (the app itself stays a standalone file).
//
// Deliberately small: it understands the flat markup this app generates
// (<tag attrs>text</tag>) and the handful of DOM APIs the script uses.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "charxi_online.html");
// charxi_online.html used to inline its CSS/JS; it now links these two files.
// The helpers below read whichever layout is on disk, so tests survive the split.
const CSS_FILE = path.join(ROOT, "charxi_online.css");
const JS_FILE = path.join(ROOT, "charxi_online.js");
const KEY_FILE = path.join(ROOT, "tools", "openrouter_api_key.txt");

function parseChildren(html) {
  const out = [];
  const re = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/?>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/<\w+/.test(m[3])) continue; // skip nested markup
    const el = new El(m[1]);
    const ar = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = ar.exec(m[2]))) el.setAttribute(a[1], a[2]);
    el.textContent = m[3].replace(/<[^>]*>/g, "");
    out.push(el);
  }
  return out;
}

function flatten(list) {
  const out = [];
  const walk = arr => arr.forEach(el => { out.push(el); walk(el.children); });
  walk(list);
  return out;
}

class El {
  constructor(tag, id) {
    this.tagName = String(tag || "div").toUpperCase();
    this.id = id || "";
    this.children = [];
    this._attrs = {};
    this._classes = new Set();
    this._text = "";
    this._html = "";
    this.value = "";
    this.type = "";
    this.checked = false;
    this.disabled = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.dataset = {};
    this._listeners = {};
    const self = this;
    this.classList = {
      add(...c) { c.forEach(x => x && self._classes.add(x)); },
      remove(...c) { c.forEach(x => self._classes.delete(x)); },
      toggle(c, on) {
        if (on === undefined) self._classes.has(c) ? self._classes.delete(c) : self._classes.add(c);
        else on ? self._classes.add(c) : self._classes.delete(c);
      },
      contains(c) { return self._classes.has(c); },
    };
    this.className = "";
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(" "); }
  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === "class") this.className = v;
    if (k === "value") this.value = String(v);
    if (k.startsWith("data-")) this.dataset[k.slice(5)] = String(v);
  }
  getAttribute(k) { return this._attrs[k]; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = parseChildren(this._html); }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(""); }
  set textContent(v) { this._text = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  click() { if (typeof this.onclick === "function") this.onclick({ target: this, preventDefault() {} }); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const a = this._listeners[type] || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  dispatch(type, ev = {}) { (this._listeners[type] || []).forEach(fn => fn(ev)); }
  matches(sel) {
    const m = /^([a-zA-Z]*)(?:\[([\w-]+)(?:="([^"]*)")?\])?(?:\.([\w-]+))?$/.exec(String(sel).trim());
    if (!m) return false;
    const [, tag, attr, val, cls] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (cls && !this._classes.has(cls)) return false;
    if (attr) {
      const actual = this._attrs[attr];
      if (actual === undefined) return false;
      if (val !== undefined && actual !== val) return false;
    }
    return true;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { return flatten(this.children).filter(el => el.matches(sel)); }
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map,
  };
}

// Contents of every local file referenced by `re` (the capture group is the URL).
// Query strings (cache busters like ?v=1) are stripped; remote URLs are skipped.
function readLocalAssets(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) {
    const href = String(m[1]).trim();
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue; // remote, not our file
    const file = path.join(ROOT, href.split("?")[0]);
    if (fs.existsSync(file)) out.push(fs.readFileSync(file, "utf8"));
  }
  return out;
}

// The app's JavaScript: inline <script> blocks first, then any local <script src>.
function extractAppScript(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .concat(readLocalAssets(html, /<script\b[^>]*\ssrc="([^"]+)"/g));
  if (!blocks.length) throw new Error("no app <script> found in charxi_online.html");
  return blocks.join("\n");
}

// The page's CSS: inline <style> blocks plus any linked local stylesheet.
function loadPageCss(html) {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1])
    .concat(readLocalAssets(html, /<link\b[^>]*\shref="([^"]+\.css[^"]*)"/g))
    .join("\n");
}

// Runs the app's real script in a sandbox. `seed` pre-fills localStorage
// before boot() runs, so tests can start from a saved-setup state.
function bootApp({ html, script, fetchImpl, seed }) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const els = new Map();
  for (const id of ids) {
    const tagM = new RegExp(`<(\\w+)[^>]*\\sid="${id}"`).exec(html);
    els.set(id, new El(tagM ? tagM[1] : "div", id));
  }
  const document = {
    body: new El("body"),
    documentElement: new El("html"),
    getElementById: id => els.get(id) || null,
    createElement: tag => new El(tag),
    createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const localStorage = makeStorage();
  if (seed) Object.keys(seed).forEach(k => localStorage.setItem(k, seed[k]));
  const consoleMsgs = { warn: [], error: [], log: [] };
  const ctx = {
    document,
    localStorage,
    fetch: fetchImpl,
    location: { href: "file:///charxi_online.html" },
    CSS: { escape: s => String(s).replace(/["\\]/g, "\\$&") },
    TextEncoder,
    Blob,
    URL,
    DataView,
    Uint8Array,
    console: {
      log: (...a) => consoleMsgs.log.push(a),
      warn: (...a) => consoleMsgs.warn.push(a),
      error: (...a) => consoleMsgs.error.push(a),
    },
    setTimeout: (fn, ms) => { ctx._timers.push({ fn, ms }); return ctx._timers.length; },
    clearTimeout: () => {},
    _timers: [],
    window: { innerWidth: 1400, innerHeight: 900, addEventListener: () => {} },
  };
  ctx.window.document = document;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: "charxi_online.html#inline" });
  return { ctx, document, localStorage, els, consoleMsgs };
}

function readKey() {
  if (!fs.existsSync(KEY_FILE)) throw new Error(`key file not found: ${KEY_FILE}`);
  const key = fs.readFileSync(KEY_FILE, "utf8").trim();
  if (!key) throw new Error("key file is empty");
  return key;
}

module.exports = {
  ROOT, APP, CSS_FILE, JS_FILE, KEY_FILE,
  El, parseChildren, flatten, makeStorage,
  extractAppScript, extractInlineScript: extractAppScript, loadPageCss,
  bootApp, readKey,
};
