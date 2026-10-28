let DATA = { roles: [], stories: [] };
let mode = "roles";
let activeContrib = "all";
let activeTags = [];
const PAGE_SIZE = 20; // 5 rows x 4 cols
let currentPage = 1;
let installedSet = new Set();
const staticBrowser = new URLSearchParams(window.location.search).get("static") === "1";
const storeGistId = "4f4cde4c3ff29da02a89a613e039f900";

const grid = document.getElementById("grid");
const tpl = document.getElementById("cardTpl");
const tabRoles = document.getElementById("tabRoles");
const tabStories = document.getElementById("tabStories");
const contribList = document.getElementById("contribList");
const tagOptions = document.getElementById("tagOptions");
const tagActive = document.getElementById("tagActive");
const searchInput = document.getElementById("searchInput");
const sortSel = document.getElementById("sortSel");
const resultCount = document.getElementById("resultCount");
let searchQuery = "";
let sortOrder = "newest";
const menuBtn = document.getElementById("menuBtn");
const scrim = document.getElementById("scrim");

function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
  if (scrim) scrim.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}
if (menuBtn) menuBtn.onclick = () => setNav(!document.body.classList.contains("nav-open"));
if (scrim) scrim.onclick = () => setNav(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNav(false); });
// auto-close drawer after picking a filter on mobile
document.getElementById("sidebar")?.addEventListener("click", (e) => {
  if (e.target.closest("button") && window.innerWidth <= 860) setNav(false);
});

async function load() {
  try {
    if (staticBrowser) {
      document.body.classList.add("static-browser");
      const gistResponse = await fetch(`https://api.github.com/gists/${storeGistId}`, { cache: "no-store" });
      if (!gistResponse.ok) throw new Error("HTTP " + gistResponse.status + " loading the store record");
      const gist = await gistResponse.json();
      const databaseUrl = gist.files?.["db_vivid.json"]?.raw_url;
      if (!databaseUrl) throw new Error("The store record does not contain db_vivid.json");
      const storeResponse = await fetch(databaseUrl, { cache: "no-store" });
      if (!storeResponse.ok) throw new Error("HTTP " + storeResponse.status + " loading db_vivid.json");
      DATA = await storeResponse.json();
    } else {
      const res = await fetch("/api/store", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status + " loading /api/store");
      DATA = await res.json();
    }
  } catch (e) {
    grid.textContent = staticBrowser
      ? "Could not load store data: " + e.message + ". Check that GitHub Gist is reachable and allows browser requests."
      : "Could not load store data: " + e.message +
        ". Ensure the backend is running and /api/store is accessible.";
    return;
  }
  if (!staticBrowser) await refreshInstalled();
  syncSortOptions();
  renderContribs();
  renderTagUI();
  render();
}

async function refreshInstalled() {
  try {
    const res = await fetch("/api/installed", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      installedSet = new Set((json.installed || []).map(x => x.gist_id));
    }
  } catch (_) {
    // ignore – keep existing set
  }
}

// "Installed only" filters Roles down to what is present in chats/roles.
// It has no meaning for Stories, so the option is hidden while browsing those.
function syncSortOptions() {
  if (!sortSel) return;
  const opt = [...sortSel.options].find(o => o.value === "installed");
  if (!opt) return;
  const isRoles = mode === "roles" && !staticBrowser;
  if (!isRoles && sortOrder === "installed") {
    sortOrder = "newest";
    sortSel.value = "newest";
  }
  opt.hidden = !isRoles;
  opt.disabled = !isRoles;
}

async function installRole(gistId) {
  try {
    const res = await fetch("/api/store/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "role", gist_id: gistId })
    });
    if (res.ok) {
      installedSet.add(gistId);
      if (sortOrder === "installed") render();
      return true;
    }
    const txt = await res.text();
    alert("Install failed: " + txt);
    return false;
  } catch (e) {
    alert("Install error: " + e);
    return false;
  }
}

async function uninstallRole(gistId) {
  try {
    const res = await fetch("/api/store/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "role", gist_id: gistId })
    });
    if (res.ok) {
      installedSet.delete(gistId);
      if (sortOrder === "installed") render();
      return true;
    }
    const txt = await res.text();
    alert("Uninstall failed: " + txt);
    return false;
  } catch (e) {
    alert("Uninstall error: " + e);
    return false;
  }
}

tabRoles.onclick = () => setMode("roles");
tabStories.onclick = () => setMode("stories");

function prettyTitle(s) {
  s = String(s || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function trunc(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n).trimEnd() + "..." : s;
}

function parseTagsField(t) {
  if (Array.isArray(t)) return t;
  if (typeof t === "string" && t.trim()) {
    try { const a = JSON.parse(t); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  return [];
}

function card({ kind, id, title, img, desc, tags, quality, sfw, url }) {
  const el = tpl.content.cloneNode(true);
  const imgEl = el.querySelector("img");
  const link = el.querySelector(".thumbLink");
  const pretty = prettyTitle(title);
  if (img) {
    imgEl.src = img; imgEl.alt = pretty;
    if (sfw !== "safe") imgEl.classList.add("is-blurred");
  }
  else { const d = document.createElement("div"); d.className = "noimg"; d.textContent = "No thumbnail"; imgEl.replaceWith(d); }
  el.querySelector(".name").textContent = pretty;
  const starsEl = el.querySelector(".stars");
  const q = Number(quality) || 0;
  if (starsEl) {
    if (q >= 1 && q <= 5) {
      starsEl.innerHTML = "";
      const full = document.createElement("span");
      full.className = "full";
      full.textContent = "★".repeat(q);
      full.setAttribute("aria-hidden", "true");
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "★".repeat(5 - q);
      empty.setAttribute("aria-hidden", "true");
      const num = document.createElement("span");
      num.className = "stars-num";
      num.textContent = ` ${q}/5`;
      starsEl.append(full, empty, num);
      starsEl.title = `${q} of 5 - completeness rating`;
      starsEl.setAttribute("aria-label", `Rated ${q} out of 5`);
      starsEl.hidden = false;
    } else {
      starsEl.remove();
    }
  }
  el.querySelector(".desc").textContent = trunc(desc, 170);
  const tagBox = el.querySelector(".tags");
  // Display order: content rating first, then relationship tags, then the
  // rest in their original (LLM) order. Ranks come from tag_allowed.txt
  // sections, exported as tag_rank; stable sort keeps groups unmixed.
  const RATING_FALLBACK = new Set(["SFW", "NSFW", "Mature", "18+"]);
  const rankOf = (t) => {
    const r = DATA.tag_rank ? DATA.tag_rank[t] : undefined;
    if (r !== undefined) return r;
    return RATING_FALLBACK.has(t) ? 0 : 2;
  };
  parseTagsField(tags)
    .map((t, i) => [t, i])
    .sort((a, b) => (rankOf(a[0]) - rankOf(b[0])) || (a[1] - b[1]))
    .map(([t]) => t)
    .forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill" + (activeTags.includes(t) ? " on" : "");
    b.textContent = t;
    b.title = "Filter by " + t;
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleTag(t); };
    tagBox.appendChild(b);
  });
  link.href = staticBrowser ? (url || "#") : `/detail?kind=${kind}&id=${encodeURIComponent(id)}`;
  link.target = "_blank";

  // Install / Uninstall buttons for roles only
  if (kind === "roles" && !staticBrowser) {
    const installBtn = el.querySelector(".installBtn");
    const uninstallBtn = el.querySelector(".uninstallBtn");
    const isInstalled = installedSet.has(id);
    if (isInstalled) {
      installBtn.hidden = true;
      uninstallBtn.hidden = false;
    } else {
      installBtn.hidden = false;
      uninstallBtn.hidden = true;
    }
    installBtn.onclick = async () => {
      const ok = await installRole(id);
      if (ok) {
        installBtn.hidden = true;
        uninstallBtn.hidden = false;
      }
    };
    uninstallBtn.onclick = async () => {
      const msg = `Uninstall "${pretty}"?\n\n` +
        "This will delete all of your chats and history with this role. " +
        "This cannot be undone.";
      if (!window.confirm(msg)) return;
      uninstallBtn.disabled = true;
      const ok = await uninstallRole(id);
      if (ok) {
        uninstallBtn.hidden = true;
        installBtn.hidden = false;
      } else {
        uninstallBtn.disabled = false;
      }
    };
  } else {
    // hide both for non-roles (stories)
    el.querySelector(".installBtn").hidden = true;
    el.querySelector(".uninstallBtn").hidden = true;
  }

  return el;
}

function itemDate(r) {
  return Date.parse(r.gist_created_at || r.first_seen || r.last_changed || 0) || 0;
}

function filteredItems() {
  const byOwner = (r) => activeContrib === "all" || (r.owner || "Unknown") === activeContrib;
  const byInstalled = (r) => sortOrder !== "installed" || installedSet.has(r.gist_id || r.id);
  const byTags = (r) => { const ts = parseTagsField(r.tags); return activeTags.every(t => ts.includes(t)); };
  const q = searchQuery.toLowerCase().trim();
  const bySearch = (r) => {
    if (!q) return true;
    const hay = [r.rolename || r.storyname || r.id || "", r.description || "",
      parseTagsField(r.tags).join(" "), r.owner || ""].join(" ").toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  };
  const list = (mode === "roles" ? (DATA.roles || []) : (DATA.stories || []))
    .filter(r => byOwner(r) && byInstalled(r) && byTags(r) && bySearch(r));
  const byName = (a, b) => String(a.rolename || a.storyname || a.id || "")
    .localeCompare(String(b.rolename || b.storyname || b.id || ""));
  if (sortOrder === "oldest") list.sort((a, b) => itemDate(a) - itemDate(b) || byName(a, b));
  else if (sortOrder === "stars") list.sort((a, b) =>
    ((Number(b.quality) || 0) - (Number(a.quality) || 0)) || (itemDate(b) - itemDate(a)) || byName(a, b));
  else list.sort((a, b) => (itemDate(b) - itemDate(a)) || byName(a, b)); // newest
  return list;
}

function itemToCardArgs(kind, r) {
  const sfw = String(r.image_sfw || "").trim().toLowerCase();
  return kind === "roles"
    ? { kind, id: r.id, title: r.rolename || r.id, img: r.image_url, desc: r.description, tags: r.tags, quality: r.quality, sfw: sfw || "unchecked", url: r.gist_url }
    : { kind, id: r.id, title: r.storyname || r.id, img: r.image_url, desc: r.description, tags: r.tags, sfw: sfw || "unchecked", url: r.gist_url };
}

function renderPager(el, totalPages) {
  if (!el) return;
  el.innerHTML = "";
  if (totalPages <= 1) { el.hidden = true; return; }
  el.hidden = false;
  const mk = (label, page, opts = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pageBtn" + (opts.active ? " active" : "");
    b.textContent = label;
    b.disabled = !!opts.disabled;
    if (opts.title) b.title = opts.title;
    b.onclick = () => { currentPage = page; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    return b;
  };
  el.appendChild(mk("‹ Prev", Math.max(1, currentPage - 1), { disabled: currentPage <= 1, title: "Previous page" }));
  // compact page numbers with window around current
  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  pages.forEach(p => {
    if (p === "…") {
      const s = document.createElement("span");
      s.className = "pageGap";
      s.textContent = "…";
      el.appendChild(s);
    } else {
      el.appendChild(mk(String(p), p, { active: p === currentPage, title: "Page " + p }));
    }
  });
  el.appendChild(mk("Next ›", Math.min(totalPages, currentPage + 1), { disabled: currentPage >= totalPages, title: "Next page" }));
  const info = document.createElement("span");
  info.className = "pageInfo";
  info.textContent = `Page ${currentPage} of ${totalPages}`;
  el.appendChild(info);
}

function render() {
  grid.innerHTML = "";
  const items = filteredItems();
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  items.slice(start, start + PAGE_SIZE).forEach(r => {
    grid.appendChild(card(itemToCardArgs(mode, r)));
  });
  if (!grid.children.length) grid.innerHTML = sortOrder === "installed"
    ? "<p>No installed roles match the current filters.</p>"
    : "<p>No results.</p>";
  if (resultCount) resultCount.textContent = `${items.length} result${items.length === 1 ? "" : "s"}`;
  renderPager(document.getElementById("pagerTop"), totalPages);
  renderPager(document.getElementById("pagerBottom"), totalPages);
}

function renderContribs() {
  contribList.innerHTML = "";
  const counts = {};
  [...(DATA.roles || []), ...(DATA.stories || [])].forEach(r => {
    const o = r.owner || "Unknown";
    counts[o] = counts[o] || { roles: 0, stories: 0 };
    if ((DATA.roles || []).includes(r)) counts[o].roles++;
    else counts[o].stories++;
  });
  const mkRow = (owner, roles, stories) => {
    const wrap = document.createElement("div");
    wrap.className = "contrib" + (activeContrib === owner ? " active" : "");
    const nameBtn = document.createElement("button");
    nameBtn.className = "contribName";
    nameBtn.textContent = owner === "all" ? "All contributors" : owner;
    nameBtn.onclick = () => { activeContrib = owner; currentPage = 1; renderContribs(); render(); };
    wrap.appendChild(nameBtn);
    const sub = document.createElement("div");
    sub.className = "contribLinks";
    const rBtn = document.createElement("button");
    rBtn.className = "linklike";
    rBtn.textContent = `Roles (${owner === "all" ? (DATA.roles || []).length : roles})`;
    rBtn.onclick = () => { activeContrib = owner; setMode("roles"); };
    const sBtn = document.createElement("button");
    sBtn.className = "linklike";
    sBtn.textContent = `Stories (${owner === "all" ? (DATA.stories || []).length : stories})`;
    sBtn.onclick = () => { activeContrib = owner; setMode("stories"); };
    sub.append(rBtn, document.createTextNode(" · "), sBtn);
    wrap.appendChild(sub);
    contribList.appendChild(wrap);
  };
  mkRow("all");
  Object.keys(counts).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .forEach(o => mkRow(o, counts[o].roles, counts[o].stories));
}

function setMode(m) {
  mode = m;
  currentPage = 1;
  syncSortOptions();
  tabRoles.classList.toggle("active", m === "roles");
  tabStories.classList.toggle("active", m === "stories");
  renderContribs();
  renderTagUI();
  render();
}

function allTags() {
  const set = new Map();
  [...(DATA.roles || []), ...(DATA.stories || [])].forEach(r => {
    parseTagsField(r.tags).forEach(t => set.set(t, (set.get(t) || 0) + 1));
  });
  return [...set.entries()].sort((a, b) => (b[1] - a[1]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
}

function toggleTag(t) {
  const i = activeTags.indexOf(t);
  if (i >= 0) activeTags.splice(i, 1);
  else activeTags.push(t);
  currentPage = 1;
  renderTagUI();
  render();
}

function renderTagUI() {
  tagOptions.innerHTML = "";
  const avail = allTags().filter(([t]) => !activeTags.includes(t));
  if (!avail.length) {
    tagOptions.innerHTML = allTags().length ? "<div class='tagOptEmpty'>All tags selected</div>" : "<div class='tagOptEmpty'>No tags yet — run scan_gists.py</div>";
  } else {
    avail.forEach(([t, n]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tagOpt";
      b.textContent = `${t} (${n})`;
      b.onclick = () => toggleTag(t);
      tagOptions.appendChild(b);
    });
  }
  tagActive.innerHTML = "";
  activeTags.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill on";
    b.textContent = t + " ✕";
    b.title = "Remove filter";
    b.onclick = () => toggleTag(t);
    tagActive.appendChild(b);
  });
  if (activeTags.length) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "linklike";
    c.textContent = "Clear tags";
    c.onclick = () => { activeTags = []; currentPage = 1; renderTagUI(); render(); };
    tagActive.appendChild(c);
  }
}

if (searchInput) searchInput.oninput = () => { searchQuery = searchInput.value || ""; currentPage = 1; render(); };
if (sortSel) sortSel.onchange = () => { sortOrder = sortSel.value; currentPage = 1; render(); };

load();