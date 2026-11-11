/* story_creator.js - Story Creator page logic for story_creator.html.
   Standalone (does not load charxi_online.js): storage keys + chat model
   are read from the same localStorage entries the chat page uses. */

"use strict";

/* ================= AI Enhance ================= */
let scUndoSnapshot = null;
let scEnhancing = false;

async function scCallChat(system, user) {
  const cfg = scChatConfig();
  if (!cfg.apiKey || !cfg.model) {
    throw new Error("No chat API key/model saved. Finish Setup in Chat first.");
  }
  const res = await fetch(SC_OR + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cfg.apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": location.href,
      "X-Title": "GoChat"
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_tokens: 1200
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("HTTP " + res.status + (body ? " " + body.slice(0, 220) : ""));
  }
  const json = await res.json();
  const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!text || !String(text).trim()) throw new Error("Empty reply from model.");
  return String(text).trim();
}

async function scAiEnhance(contextLabel, btn) {
  if (scEnhancing) return;

  const isCharacter = contextLabel === "Character";
  const descriptionField = document.getElementById(isCharacter ? "charDesc" : "elemDesc");
  const nameField = document.getElementById(isCharacter ? "charName" : "elemName");
  const targetDesc = descriptionField.value;
  const targetName = nameField.value || (isCharacter ? "Unnamed Character" : "Unnamed Element");

  const copyBtn = isCharacter
    ? document.getElementById("copyCharPromptBtn")
    : document.getElementById("copyElemPromptBtn");
  const imagePromptField = document.getElementById(isCharacter ? "charImagePrompt" : "elemImagePrompt");
  if (copyBtn) copyBtn.disabled = true;
  imagePromptField.value = "";

  const originalDescription = targetDesc.trim();
  if (!originalDescription) {
    scMessage("Write a " + contextLabel.toLowerCase() + " description first, then AI Enhance.", "err");
    return;
  }

  scEnhancing = true;
  if (btn) { btn.disabled = true; btn.textContent = "Enhancing..."; }
  scMessage("");

  try {
    const enhanced = await scCallChat(
      "You write a " + contextLabel.toLowerCase() + " description for a story. Make things up to fill every field.\n" +
      "Follow the structure below exactly: use its headings, fields, and order.\n" +
      "Invent plausible details for every missing field so the " + contextLabel.toLowerCase() + " feels complete. Never leave a field blank and never write 'Not specified', 'Unknown', or similar filler.\n" +
      "Keep it concise and directly usable. No preamble, no commentary.",
      contextLabel + " name: " + targetName + "\n\n" +
      "ORIGINAL DESCRIPTION:\n" + originalDescription
    );

    const imagePrompt = await scCallChat(
      "You write a single detailed Perchance AI text-to-image prompt from a " + contextLabel.toLowerCase() + " description.\n" +
      "Use only appearance/visual details that can reasonably be gleaned from the description; where details are missing, choose simple, neutral, attractive defaults.\n" +
      "Always write a centered composition, drawn-anime style, square aspect ratio, clean background, soft lighting.\n" +
      "One paragraph only. No preamble, no explanation, no quotes, no bullet points.",
      contextLabel + " description:\n" + enhanced
    );

    imagePromptField.value = imagePrompt;
    if (copyBtn) copyBtn.disabled = false;

    scUndoSnapshot = {
      storyDesc: document.getElementById("storyDesc").value,
      charDesc: document.getElementById("charDesc").value,
      elemDesc: document.getElementById("elemDesc").value
    };

    descriptionField.value = enhanced;

    scMessage("AI Enhance complete. Review the description, then Save Story.", "ok");
  } catch (e) {
    scMessage("AI Enhance failed: " + e.message, "err");
  } finally {
    scEnhancing = false;
    if (btn) { btn.disabled = false; btn.textContent = "🪄 AI Enhance"; }
  }
}

function scUndoEnhance() {
  if (!scUndoSnapshot) {
    scMessage("Nothing to undo — run AI Enhance first.", "err");
    return;
  }
  document.getElementById("storyDesc").value = scUndoSnapshot.storyDesc || "";
  document.getElementById("charDesc").value = scUndoSnapshot.charDesc || "";
  document.getElementById("elemDesc").value = scUndoSnapshot.elemDesc || "";
  scUndoSnapshot = null;
  scMessage("Undone — description restored to before AI Enhance.", "ok");
}

function scCopyCharPrompt() {
  const promptField = document.getElementById("charImagePrompt");
  const text = (promptField.value || "").trim();
  if (!text) { scMessage("No character image prompt to copy — run AI Enhance on a character first.", "err"); return; }
  navigator.clipboard.writeText(text).then(
    () => scMessage("Character image prompt copied.", "ok"),
    () => { promptField.select(); scMessage("Copy blocked — prompt selected, press Ctrl+C.", "err"); }
  );
}

function scCopyElemPrompt() {
  const promptField = document.getElementById("elemImagePrompt");
  const text = (promptField.value || "").trim();
  if (!text) { scMessage("No element image prompt to copy — run AI Enhance on a story element first.", "err"); return; }
  navigator.clipboard.writeText(text).then(
    () => scMessage("Element image prompt copied.", "ok"),
    () => { promptField.select(); scMessage("Copy blocked — prompt selected, press Ctrl+C.", "err"); }
  );
}

function scClearForm() {
  const applyStorySel = document.getElementById("applyStorySel");
  const applyCharSel = document.getElementById("applyCharSel");
  const applyElemSel = document.getElementById("applyElemSel");
  if (applyStorySel) applyStorySel.value = "";
  if (applyCharSel) applyCharSel.value = "";
  if (applyElemSel) applyElemSel.value = "";
  sccharSel.value = "";
  scelemSel.value = "";
  scstoryName.value = "";
  scstoryDesc.value = "";
  sccharName.value = "";
  sccharDesc.value = "";
  scelemName.value = "";
  scelemDesc.value = "";
  scUndoSnapshot = null;
  scSetStoryImageDataUrl("", "");
  scSetCharImageDataUrl("", "");
  scSetElemImageDataUrl("", "");
  scSetAssignImageDataUrl("", "");
  // Clear stored image prompts and disable their copy buttons.
  sccharImagePrompt.value = "";
  scelemImagePrompt.value = "";
  const copyCharBtn = document.getElementById("copyCharPromptBtn");
  const copyElemBtn = document.getElementById("copyElemPromptBtn");
  if (copyCharBtn) copyCharBtn.disabled = true;
  if (copyElemBtn) copyElemBtn.disabled = true;
  scMessage("");
  scRenderLists();
}

/* ================= storage + chat-model config ================= */
const SC_LS = { stories: "gochat_stories", apiKey: "gochat_apiKey", model: "gochat_model" };
const SC_OR = "https://openrouter.ai/api/v1";
const SC_IMG_SIZE = 450;

const sc$ = id => document.getElementById(id);
function scLoadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function scSaveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("save failed (quota?)", e);
    return false;
  }
}
const scGetStories = () => {
  const list = scLoadJSON(SC_LS.stories, []);
  return Array.isArray(list) ? list : [];
};
const scSaveStories = list => scSaveJSON(SC_LS.stories, list);
const scChatConfig = () => ({
  apiKey: (localStorage.getItem(SC_LS.apiKey) || "").trim(),
  model: (localStorage.getItem(SC_LS.model) || "").trim()
});

/* ================= messaging ================= */
function scMessage(text, cls) {
  const msg = sc$("makerMsg");
  if (!msg) return;
  msg.textContent = text || "";
  msg.className = cls || "";
}

/* ================= story loading / saving ================= */
function scRefreshStorySelects(selectedStoryId) {
  const stories = scGetStories();
  const applyStorySel = document.getElementById("applyStorySel");
  if (applyStorySel) {
    applyStorySel.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select a saved story...";
    applyStorySel.appendChild(blank);
    stories.forEach(s => {
      const opt = document.createElement("option");
      opt.value = String(s.id || "");
      opt.textContent = s.name || "Unnamed";
      applyStorySel.appendChild(opt);
    });
    applyStorySel.value = selectedStoryId || "";
  }
}

function scRefreshCharSelects(story, selectedCharId) {
  const charSel = sccharSel;
  const applyCharSel = scapplyCharSel;
  if (!charSel || !applyCharSel) return;
  const characters = story?.characters || [];
  charSel.innerHTML = "";
  applyCharSel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select or create a character...";
  charSel.appendChild(blank);
  const blank2 = document.createElement("option");
  blank2.value = "";
  blank2.textContent = "Select a character...";
  applyCharSel.appendChild(blank2);
  characters.forEach(c => {
    const opt = document.createElement("option");
    opt.value = String(c.id || "");
    opt.textContent = c.name || "Unnamed";
    charSel.appendChild(opt.cloneNode(true));
    applyCharSel.appendChild(opt);
  });
  charSel.value = selectedCharId || "";
  applyCharSel.value = selectedCharId || "";
}

function scRefreshElemSelects(story, selectedElemId) {
  const elemSel = scelemSel;
  const applyElemSel = scapplyElemSel;
  if (!elemSel || !applyElemSel) return;
  const elements = story?.storyElements || [];
  elemSel.innerHTML = "";
  applyElemSel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select or create a story element...";
  elemSel.appendChild(blank);
  const blank2 = document.createElement("option");
  blank2.value = "";
  blank2.textContent = "Select an element...";
  applyElemSel.appendChild(blank2);
  elements.forEach(e => {
    const opt = document.createElement("option");
    opt.value = String(e.id || "");
    opt.textContent = e.name || "Unnamed";
    elemSel.appendChild(opt.cloneNode(true));
    applyElemSel.appendChild(opt);
  });
  elemSel.value = selectedElemId || "";
  applyElemSel.value = selectedElemId || "";
}

function scRefreshImageTargetSelect(story) {
  const sel = scimageTargetSel;
  if (!sel) return;
  // Preserve the first option (Story) and optgroups
  const storyOpt = sel.querySelector('option[value="story"]');
  const charGroup = sel.querySelector('optgroup[label="Characters"]');
  const elemGroup = sel.querySelector('optgroup[label="Story Elements"]');
  sel.innerHTML = "";
  if (storyOpt) sel.appendChild(storyOpt);
  if (charGroup) sel.appendChild(charGroup);
  if (elemGroup) sel.appendChild(elemGroup);
  if (!story) return;
  if (story.characters?.length) {
    story.characters.forEach(c => {
      const opt = document.createElement("option");
      opt.value = "char:" + c.id;
      opt.textContent = "👤 " + (c.name || "Unnamed");
      charGroup.appendChild(opt);
    });
  }
  if (story.storyElements?.length) {
    story.storyElements.forEach(e => {
      const opt = document.createElement("option");
      opt.value = "elem:" + e.id;
      opt.textContent = "🏷️ " + (e.name || "Unnamed");
      elemGroup.appendChild(opt);
    });
  }
}

function scLoadStoryIntoForm(story) {
  if (!story) return;
  scstoryName.value = story.name || "";
  scstoryDesc.value = story.description || "";
  scSetStoryImageDataUrl(story.imageDataUrl || "", story.imageDesc || "");
  scRefreshCharSelects(story, "");
  scRefreshElemSelects(story, "");
  scRefreshImageTargetSelect(story);
  scRenderLists();
}

function scLoadCharIntoForm(story, char) {
  if (!char) return;
  sccharName.value = char.name || "";
  sccharDesc.value = char.description || "";
  scSetCharImageDataUrl(char.imageDataUrl || "", char.imageDesc || "");
  sccharSel.value = char.id || "";
}

function scLoadElemIntoForm(story, elem) {
  if (!elem) return;
  scelemName.value = elem.name || "";
  scelemDesc.value = elem.description || "";
  scSetElemImageDataUrl(elem.imageDataUrl || "", elem.imageDesc || "");
  scelemSel.value = elem.id || "";
}

function scSaveStory() {
  const name = (scstoryName.value || "").trim();
  const description = (scstoryDesc.value || "").trim();
  if (!name) { scMessage("Enter a story name first.", "err"); scstoryName.focus(); return null; }

  const stories = scGetStories();
  const storyId = scapplyStorySel && scapplyStorySel.value;
  let story = storyId ? stories.find(s => String(s.id) === String(storyId)) : null;
  const now = Date.now();

  if (story) {
    story.name = name;
    story.description = description;
    story.imageDataUrl = scStoryImageDataUrl || story.imageDataUrl || "";
    story.imageDesc = scStoryImageMeta || story.imageDesc || "";
    story.updatedAt = now;
  } else {
    const newId = "story_" + now + "_" + Math.random().toString(36).slice(2, 8);
    story = {
      id: newId,
      name,
      description,
      imageDataUrl: scStoryImageDataUrl || "",
      imageDesc: scStoryImageMeta || "",
      characters: [],
      storyElements: [],
      updatedAt: now
    };
    stories.push(story);
  }

  if (!scSaveStories(stories)) {
    scMessage("Could not save: browser storage is full (image too large?). Try a smaller image.", "err");
    return null;
  }

  scRefreshStorySelects(story.id);
  scapplyStorySel.value = story.id;
  scLoadStoryIntoForm(story);
  scMessage("Saved story: " + name, "ok");
  return story;
}

function scAddCharacter() {
  const storyId = scapplyStorySel?.value;
  if (!storyId) { scMessage("Select or save a story first.", "err"); return; }
  const name = (sccharName.value || "").trim();
  const description = (sccharDesc.value || "").trim();
  if (!name) { scMessage("Enter a character name first.", "err"); sccharName.focus(); return; }

  const stories = scGetStories();
  const story = stories.find(s => String(s.id) === String(storyId));
  if (!story) { scMessage("Story not found.", "err"); return; }

  const charId = sccharSel?.value;
  let char = charId ? story.characters.find(c => String(c.id) === String(charId)) : null;
  const now = Date.now();

  if (char) {
    char.name = name;
    char.description = description;
    char.imageDataUrl = scCharImageDataUrl || char.imageDataUrl || "";
    char.imageDesc = scCharImageMeta || char.imageDesc || "";
  } else {
    char = {
      id: "char_" + now + "_" + Math.random().toString(36).slice(2, 8),
      name,
      description,
      imageDataUrl: scCharImageDataUrl || "",
      imageDesc: scCharImageMeta || ""
    };
    story.characters.push(char);
  }

  if (!scSaveStories(stories)) {
    scMessage("Could not save: browser storage is full.", "err");
    return;
  }

  scRefreshCharSelects(story, char.id);
  scRefreshImageTargetSelect(story);
  scLoadCharIntoForm(story, char);
  scRenderLists();
  scMessage("Saved character: " + name, "ok");
}

function scRemoveCharacter() {
  const storyId = scapplyStorySel?.value;
  const charId = sccharSel?.value;
  if (!storyId || !charId) { scMessage("Select a character to remove.", "err"); return; }

  const stories = scGetStories();
  const story = stories.find(s => String(s.id) === String(storyId));
  if (!story) { scMessage("Story not found.", "err"); return; }

  story.characters = story.characters.filter(c => String(c.id) !== String(charId));
  if (!scSaveStories(stories)) { scMessage("Save failed.", "err"); return; }

  scRefreshCharSelects(story, "");
  scRefreshImageTargetSelect(story);
  sccharName.value = "";
  sccharDesc.value = "";
  scSetCharImageDataUrl("", "");
  scRenderLists();
  scMessage("Character removed.", "ok");
}

function scAddElement() {
  const storyId = scapplyStorySel?.value;
  if (!storyId) { scMessage("Select or save a story first.", "err"); return; }
  const name = (scelemName.value || "").trim();
  const description = (scelemDesc.value || "").trim();
  if (!name) { scMessage("Enter an element name first.", "err"); scelemName.focus(); return; }

  const stories = scGetStories();
  const story = stories.find(s => String(s.id) === String(storyId));
  if (!story) { scMessage("Story not found.", "err"); return; }

  const elemId = scelemSel?.value;
  let elem = elemId ? story.storyElements.find(e => String(e.id) === String(elemId)) : null;
  const now = Date.now();

  if (elem) {
    elem.name = name;
    elem.description = description;
    elem.imageDataUrl = scElemImageDataUrl || elem.imageDataUrl || "";
    elem.imageDesc = scElemImageMeta || elem.imageDesc || "";
  } else {
    elem = {
      id: "elem_" + now + "_" + Math.random().toString(36).slice(2, 8),
      name,
      description,
      imageDataUrl: scElemImageDataUrl || "",
      imageDesc: scElemImageMeta || ""
    };
    story.storyElements.push(elem);
  }

  if (!scSaveStories(stories)) {
    scMessage("Could not save: browser storage is full.", "err");
    return;
  }

  scRefreshElemSelects(story, elem.id);
  scRefreshImageTargetSelect(story);
  scLoadElemIntoForm(story, elem);
  scRenderLists();
  scMessage("Saved element: " + name, "ok");
}

function scRemoveElement() {
  const storyId = scapplyStorySel?.value;
  const elemId = scelemSel?.value;
  if (!storyId || !elemId) { scMessage("Select an element to remove.", "err"); return; }

  const stories = scGetStories();
  const story = stories.find(s => String(s.id) === String(storyId));
  if (!story) { scMessage("Story not found.", "err"); return; }

  story.storyElements = story.storyElements.filter(e => String(e.id) !== String(elemId));
  if (!scSaveStories(stories)) { scMessage("Save failed.", "err"); return; }

  scRefreshElemSelects(story, "");
  scRefreshImageTargetSelect(story);
  scelemName.value = "";
  scelemDesc.value = "";
  scSetElemImageDataUrl("", "");
  scRenderLists();
  scMessage("Element removed.", "ok");
}

function scApplyImageToTarget() {
  const targetSel = scimageTargetSel;
  if (!targetSel || !targetSel.value) { scMessage("Select a target first.", "err"); return; }
  if (!scAssignImageDataUrl) { scMessage("No image to apply. Upload or paste an image first.", "err"); return; }

  const stories = scGetStories();
  const storyId = scapplyStorySel?.value;
  if (!storyId) { scMessage("Select a story first.", "err"); return; }
  const story = stories.find(s => String(s.id) === String(storyId));
  if (!story) { scMessage("Story not found.", "err"); return; }

  const val = targetSel.value;
  if (val === "story") {
    story.imageDataUrl = scAssignImageDataUrl;
    story.imageDesc = scAssignImageMeta;
    scSetStoryImageDataUrl(scAssignImageDataUrl, scAssignImageMeta);
    scMessage("Image applied to story.", "ok");
  } else if (val.startsWith("char:")) {
    const charId = val.slice(5);
    const char = story.characters.find(c => String(c.id) === String(charId));
    if (char) {
      char.imageDataUrl = scAssignImageDataUrl;
      char.imageDesc = scAssignImageMeta;
      scSetCharImageDataUrl(scAssignImageDataUrl, scAssignImageMeta);
      scMessage("Image applied to character: " + char.name, "ok");
    }
  } else if (val.startsWith("elem:")) {
    const elemId = val.slice(5);
    const elem = story.storyElements.find(e => String(e.id) === String(elemId));
    if (elem) {
      elem.imageDataUrl = scAssignImageDataUrl;
      elem.imageDesc = scAssignImageMeta;
      scSetElemImageDataUrl(scAssignImageDataUrl, scAssignImageMeta);
      scMessage("Image applied to element: " + elem.name, "ok");
    }
  }

  if (!scSaveStories(stories)) { scMessage("Save failed.", "err"); return; }
  scSetAssignImageDataUrl("", "");
  scRenderLists();
}

function scRenderLists() {
  const storyId = scapplyStorySel?.value;
  const charList = sccharList;
  const elemList = scelemList;
  if (!charList || !elemList) return;

  const stories = scGetStories();
  const story = storyId ? stories.find(s => String(s.id) === String(storyId)) : null;

  charList.innerHTML = "";
  if (story?.characters?.length) {
    story.characters.forEach(c => {
      const item = document.createElement("div");
      item.className = "storyChildItem";
      const img = document.createElement("img");
      img.src = c.imageDataUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'/%3E";
      img.alt = "";
      const info = document.createElement("div");
      info.className = "storyChildInfo";
      const nameDiv = document.createElement("div");
      nameDiv.className = "storyChildName";
      nameDiv.textContent = c.name || "Unnamed";
      const descDiv = document.createElement("div");
      descDiv.className = "storyChildDesc";
      descDiv.textContent = c.description ? c.description.slice(0, 60) + (c.description.length > 60 ? "..." : "") : "No description";
      info.appendChild(nameDiv);
      info.appendChild(descDiv);
      const actions = document.createElement("div");
      actions.className = "storyChildActions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn ghost sm";
      editBtn.textContent = "Edit";
      editBtn.onclick = () => scLoadCharIntoForm(story, c);
      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost sm danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        if (confirm("Delete character '" + c.name + "'?")) {
          story.characters = story.characters.filter(x => x.id !== c.id);
          scSaveStories(stories);
          scRenderLists();
        }
      };
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      item.appendChild(img);
      item.appendChild(info);
      item.appendChild(actions);
      charList.appendChild(item);
    });
  }

  elemList.innerHTML = "";
  if (story?.storyElements?.length) {
    story.storyElements.forEach(e => {
      const item = document.createElement("div");
      item.className = "storyChildItem";
      const img = document.createElement("img");
      img.src = e.imageDataUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'/%3E";
      img.alt = "";
      const info = document.createElement("div");
      info.className = "storyChildInfo";
      const nameDiv = document.createElement("div");
      nameDiv.className = "storyChildName";
      nameDiv.textContent = e.name || "Unnamed";
      const descDiv = document.createElement("div");
      descDiv.className = "storyChildDesc";
      descDiv.textContent = e.description ? e.description.slice(0, 60) + (e.description.length > 60 ? "..." : "") : "No description";
      info.appendChild(nameDiv);
      info.appendChild(descDiv);
      const actions = document.createElement("div");
      actions.className = "storyChildActions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn ghost sm";
      editBtn.textContent = "Edit";
      editBtn.onclick = () => scLoadElemIntoForm(story, e);
      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost sm danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        if (confirm("Delete element '" + e.name + "'?")) {
          story.storyElements = story.storyElements.filter(x => x.id !== e.id);
          scSaveStories(stories);
          scRenderLists();
        }
      };
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      item.appendChild(img);
      item.appendChild(info);
      item.appendChild(actions);
      elemList.appendChild(item);
    });
  }
}

/* ================= image: paste / upload, always 450x450 ================= */
let scStoryImageDataUrl = "";
let scStoryImageMeta = "";
let scCharImageDataUrl = "";
let scCharImageMeta = "";
let scElemImageDataUrl = "";
let scElemImageMeta = "";
let scAssignImageDataUrl = "";
let scAssignImageMeta = "";

function scSetStoryImageDataUrl(dataUrl, meta) {
  scStoryImageDataUrl = dataUrl || "";
  scStoryImageMeta = meta || "";
  const img = scstoryImgPreview;
  if (img) {
    if (scStoryImageDataUrl) { img.src = scStoryImageDataUrl; img.classList.add("show"); }
    else { img.removeAttribute("src"); img.classList.remove("show"); }
  }
  const metaEl = scstoryImgMeta;
  if (metaEl) metaEl.textContent = scStoryImageDataUrl ? scStoryImageMeta : "";
}
function scSetCharImageDataUrl(dataUrl, meta) {
  scCharImageDataUrl = dataUrl || "";
  scCharImageMeta = meta || "";
  const img = sccharImgPreview;
  if (img) {
    if (scCharImageDataUrl) { img.src = scCharImageDataUrl; img.classList.add("show"); }
    else { img.removeAttribute("src"); img.classList.remove("show"); }
  }
  const metaEl = sccharImgMeta;
  if (metaEl) metaEl.textContent = scCharImageDataUrl ? scCharImageMeta : "";
}
function scSetElemImageDataUrl(dataUrl, meta) {
  scElemImageDataUrl = dataUrl || "";
  scElemImageMeta = meta || "";
  const img = scelemImgPreview;
  if (img) {
    if (scElemImageDataUrl) { img.src = scElemImageDataUrl; img.classList.add("show"); }
    else { img.removeAttribute("src"); img.classList.remove("show"); }
  }
  const metaEl = scelemImgMeta;
  if (metaEl) metaEl.textContent = scElemImageDataUrl ? scElemImageMeta : "";
}
function scSetAssignImageDataUrl(dataUrl, meta) {
  scAssignImageDataUrl = dataUrl || "";
  scAssignImageMeta = meta || "";
  const img = scassignImgPreview;
  if (img) {
    if (scAssignImageDataUrl) { img.src = scAssignImageDataUrl; img.classList.add("show"); }
    else { img.removeAttribute("src"); img.classList.remove("show"); }
  }
  const metaEl = scassignImgMeta;
  if (metaEl) metaEl.textContent = scAssignImageDataUrl ? scAssignImageMeta : "";
}

function scFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function scLoadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a valid image."));
    img.src = dataUrl;
  });
}

function scResizeToSquare(image) {
  const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = Math.max(0, ((image.naturalWidth || image.width) - side) / 2);
  const sy = Math.max(0, ((image.naturalHeight || image.height) - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = SC_IMG_SIZE;
  canvas.height = SC_IMG_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, side, side, 0, 0, SC_IMG_SIZE, SC_IMG_SIZE);
  return canvas;
}

async function scApplyImageBlob(blob, sourceLabel) {
  if (!blob) return;
  const type = blob.type || "";
  if (type && type.indexOf("image/") !== 0) { scMessage("That is not an image file.", "err"); return; }
  if (blob.size > 8 * 1024 * 1024) { scMessage("That image is over 8 MB - pick a smaller one.", "err"); return; }
  try {
    const dataUrl = await scFileToDataUrl(blob);
    const image = await scLoadImage(dataUrl);
    const canvas = scResizeToSquare(image);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    const kb = Math.round((out.length * 3) / 4 / 1024);
    const meta = SC_IMG_SIZE + "x" + SC_IMG_SIZE + " - JPEG ~" + kb + " KB - " + sourceLabel;
    scSetAssignImageDataUrl(out, meta);
    scMessage("Image ready (" + SC_IMG_SIZE + "x" + SC_IMG_SIZE + "). Click Apply to assign to selected target.", "ok");
  } catch (e) {
    scMessage("Could not use that image: " + e.message, "err");
  }
}

async function scPasteImageFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = (item.types || []).find(t => t.indexOf("image/") === 0);
      if (imageType) {
        const blob = await item.getType(imageType);
        await scApplyImageBlob(blob, "pasted");
        return;
      }
    }
    scMessage("No image found on the clipboard. Copy an image first, or Upload Image instead.", "err");
  } catch (e) {
    scMessage("Clipboard read failed. Use Ctrl+V on this page or Upload Image instead.", "err");
  }
}

/* ================= wiring ================= */
function scInit() {
  scRefreshStorySelects("");

  const storySel = document.getElementById("applyStorySel");
  if (storySel) storySel.addEventListener("change", () => {
    const storyId = storySel.value;
    if (storyId) {
      const stories = scGetStories();
      const story = stories.find(s => String(s.id) === String(storyId));
      if (story) scLoadStoryIntoForm(story);
    } else {
      scClearForm();
    }
  });

  const charSel = sc$("charSel");
  if (charSel) charSel.addEventListener("change", () => {
    const storyId = sc$("applyStorySel")?.value;
    const charId = charSel.value;
    if (storyId && charId) {
      const stories = scGetStories();
      const story = stories.find(s => String(s.id) === String(storyId));
      const char = story?.characters.find(c => String(c.id) === String(charId));
      if (char) scLoadCharIntoForm(story, char);
    }
  });

  const elemSel = sc$("elemSel");
  if (elemSel) elemSel.addEventListener("change", () => {
    const storyId = sc$("applyStorySel")?.value;
    const elemId = elemSel.value;
    if (storyId && elemId) {
      const stories = scGetStories();
      const story = stories.find(s => String(s.id) === String(storyId));
      const elem = story?.storyElements.find(e => String(e.id) === String(elemId));
      if (elem) scLoadElemIntoForm(story, elem);
    }
  });

  const enhanceCharBtn = document.getElementById("enhanceCharBtn");
  if (enhanceCharBtn) {
    enhanceCharBtn.addEventListener("click", () => scAiEnhance("Character", enhanceCharBtn));
  }

  const enhanceElemBtn = document.getElementById("enhanceElemBtn");
  if (enhanceElemBtn) {
    enhanceElemBtn.addEventListener("click", () => scAiEnhance("Story Element", enhanceElemBtn));
  }

  const copyCharPromptBtn = document.getElementById("copyCharPromptBtn");
  if (copyCharPromptBtn) copyCharPromptBtn.addEventListener("click", scCopyCharPrompt);

  const copyElemPromptBtn = document.getElementById("copyElemPromptBtn");
  if (copyElemPromptBtn) copyElemPromptBtn.addEventListener("click", scCopyElemPrompt);

  const saveBtn = sc$("saveStoryBtn");
  if (saveBtn) saveBtn.addEventListener("click", scSaveStory);

  const clearBtn = sc$("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", scClearForm);

  const applyImageBtn = sc$("applyImageBtn");
  if (applyImageBtn) applyImageBtn.addEventListener("click", scApplyImageToTarget);

  const addCharBtn = sc$("addCharBtn");
  if (addCharBtn) addCharBtn.addEventListener("click", scAddCharacter);

  const removeCharBtn = sc$("removeCharBtn");
  if (removeCharBtn) removeCharBtn.addEventListener("click", scRemoveCharacter);

  const addElemBtn = sc$("addElemBtn");
  if (addElemBtn) addElemBtn.addEventListener("click", scAddElement);

  const removeElemBtn = sc$("removeElemBtn");
  if (removeElemBtn) removeElemBtn.addEventListener("click", scRemoveElement);

  const uploadAssignBtn = sc$("uploadAssignImageBtn");
  const assignFileInput = sc$("assignImageUpload");
  if (uploadAssignBtn && assignFileInput) {
    uploadAssignBtn.addEventListener("click", () => assignFileInput.click());
    assignFileInput.addEventListener("change", () => {
      const file = assignFileInput.files && assignFileInput.files[0];
      if (file) scApplyImageBlob(file, "uploaded");
      assignFileInput.value = "";
    });
  }

  const clearAssignBtn = sc$("clearAssignImageBtn");
  if (clearAssignBtn) clearAssignBtn.addEventListener("click", () => { scSetAssignImageDataUrl("", ""); scMessage("Assignment image cleared.", "ok"); });

  const backBtn = sc$("backToChatBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    if (window.opener && !window.opener.closed) {
      try { window.opener.location.reload(); } catch (e) { /* cross-origin: ignore */ }
      window.close();
    } else {
      location.href = "charxi_online.html";
    }
  });

  document.addEventListener("paste", event => {
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.indexOf("image/") === 0) {
        event.preventDefault();
        scApplyImageBlob(item.getAsFile(), "pasted");
        return;
      }
    }
  });

  document.addEventListener("paste", async (event) => {
    if (event.clipboardData && event.clipboardData.items) return;
    try {
      await scPasteImageFromClipboard();
    } catch (e) { /* ignore */ }
  });

  scMessage("");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scInit);
else scInit();