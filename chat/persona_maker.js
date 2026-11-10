
/* ================= AI Enhance ================= */
let pmUndoSnapshot = null;
let pmEnhancing = false;

async function pmCallChat(system, user) {
  const cfg = pmChatConfig();
  if (!cfg.apiKey || !cfg.model) {
    throw new Error("No chat API key/model saved. Finish Setup in Chat first.");
  }
  const res = await fetch(PM_OR + "/chat/completions", {
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

async function pmAiEnhance() {
  if (pmEnhancing) return;
  const originalDescription = pm$("personaDesc").value.trim();
  const description = pm$("personaDesc").value;
  if (!originalDescription) {
    pmMessage("Write a persona description first, then AI Enhance.", "err");
    return;
  }
  const personaName = (pm$("personaName").value || "").trim();
  const templateFile = pm$("templateSel") && pm$("templateSel").value;
  let templateText = "";
  if (templateFile) {
    try { templateText = await pmFetchTemplate(templateFile); }
    catch (e) { pmMessage("Could not load the template: " + e.message, "err"); return; }
  }

  const btn = pm$("enhanceBtn");
  pmEnhancing = true;
  if (btn) { btn.disabled = true; btn.textContent = "Enhancing..."; }
  pmMessage("");
  try {
    const templateLabel = templateFile
      ? (PM_TEMPLATES.find(t => t.file === templateFile) || {}).label || templateFile
      : "No template";
    const enhanced = await pmCallChat(
      "You write a persona description using the template below. Make things up to fill every field.\n" +
      "Follow the user's chosen template exactly: use its headings, fields, and order.\n" +
      "Invent plausible details for every missing field so the persona feels complete. Never leave a field blank and never write 'Not specified', 'Unknown', or similar filler.\n" +
      "Only two restrictions:\n" +
      "- Facts the user gave (name, key life events, skills, traits, eye colour, etc.) must be kept exactly as written.\n" +
      "- Gender/sex: infer it from the user's given name where the name is a recognisable first name (e.g. John, Aiko, Sam = Male / Female / neutral). Only use 'Not specified' for unisex/given names that are genuinely ambiguous.\n" +
      "Keep it concise and directly usable as a persona description. No preamble, no commentary.",
      "Persona name: " + (personaName || "Not specified") + "\n\n" +
      "TEMPLATE (" + templateLabel + "):\n" +
      (templateText || "(none - organise it sensibly on your own)") + "\n\n" +
      "PERSONA DESCRIPTION:\n" + description
    );
    const imagePrompt = await pmCallChat(
      "You write a single detailed image-generation prompt from a persona description.\n" +
      "Use only appearance details that can reasonably be gleaned from the description; where details are missing, choose simple, neutral, attractive defaults.\n" +
      "Always write a waist-up portrait of the person smiling and attractive, drawn-anime style, square composition, clean background, soft lighting.\n" +
      "One paragraph only. No preamble, no explanation, no quotes, no bullet points.",
      "Persona description:\n" + enhanced
    );
    pmUndoSnapshot = { description: pm$("personaDesc").value, perchance: pm$("perchancePrompt").value };
    pm$("personaDesc").value = enhanced;
    pm$("perchancePrompt").value = imagePrompt;
    pmMessage("AI Enhance complete. Review the description, then Save Persona.", "ok");
  } catch (e) {
    pmMessage("AI Enhance failed: " + e.message, "err");
  } finally {
    pmEnhancing = false;
    if (btn) { btn.disabled = false; btn.textContent = "🪄 AI Enhance"; }
  }
}

function pmUndoEnhance() {
  if (!pmUndoSnapshot) {
    pmMessage("Nothing to undo — run AI Enhance first.", "err");
    return;
  }
  pm$("personaDesc").value = pmUndoSnapshot.description;
  pm$("perchancePrompt").value = pmUndoSnapshot.perchance || "";
  pmUndoSnapshot = null;
  pmMessage("Undone — description restored to before AI Enhance.", "ok");
}

function pmClearForm() {
  pm$("personaSel").value = "";
  pm$("personaName").value = "";
  pm$("templateSel").value = "";
  pm$("personaDesc").value = "";
  pm$("perchancePrompt").value = "";
  pmUndoSnapshot = null;
  pmHidePreview();
  pmSetImageDataUrl("", "");
  pmMessage("");
}

/* persona_maker.js - Persona Maker page logic for persona_maker.html.
   Standalone (does not load charxi_online.js): storage keys + chat model
   are read from the same localStorage entries the chat page uses. */
"use strict";

/* ================= storage + chat-model config ================= */
const PM_LS = { personas: "gochat_personas", apiKey: "gochat_apiKey", model: "gochat_model" };
const PM_OR = "https://openrouter.ai/api/v1";
const PM_IMG_SIZE = 450;

const pm$ = id => document.getElementById(id);
function pmLoadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function pmSaveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("save failed (quota?)", e);
    return false;
  }
}
const pmGetPersonas = () => {
  const list = pmLoadJSON(PM_LS.personas, []);
  return Array.isArray(list) ? list : [];
};
const pmSavePersonas = list => pmSaveJSON(PM_LS.personas, list);
const pmChatConfig = () => ({
  apiKey: (localStorage.getItem(PM_LS.apiKey) || "").trim(),
  model: (localStorage.getItem(PM_LS.model) || "").trim()
});

/* ================= templates (loaded as web resources) ================= */
const PM_TEMPLATES = [
  { file: "basic_user_template.txt", label: "Basic User Template" },
  { file: "user_persona_template.txt", label: "User Persona Template" }
];
const PM_TEMPLATE_DIR = "persona_templates/";
const pmTemplateCache = new Map(); // file -> Promise<string>

function pmMessage(text, cls) {
  const msg = pm$("makerMsg");
  if (!msg) return;
  msg.textContent = text || "";
  msg.className = cls || "";
}

/* ================= persona loading / saving ================= */
function pmRefreshPersonaSelect(selectedId) {
  const sel = pm$("personaSel");
  if (!sel) return;
  const personas = pmGetPersonas();
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select or create a persona...";
  sel.appendChild(blank);
  personas.forEach(p => {
    const opt = document.createElement("option");
    opt.value = String(p.id || "");
    opt.textContent = p.name || "Unnamed";
    sel.appendChild(opt);
  });
  sel.value = selectedId || "";
}

function pmCurrentPersona() {
  const id = pm$("personaSel") && pm$("personaSel").value;
  if (!id) return null;
  return pmGetPersonas().find(p => String(p.id) === String(id)) || null;
}

function pmLoadPersonaIntoForm(persona) {
  if (!persona) return;
  pm$("personaName").value = persona.name || "";
  pm$("personaDesc").value = persona.prompt || "";
  pm$("perchancePrompt").value = persona.imageDesc || "";
  pmSetImageDataUrl(persona.imageDataUrl || "", persona.imageDesc || "");
}

function pmSavePersona() {
  const name = (pm$("personaName").value || "").trim();
  const prompt = (pm$("personaDesc").value || "").trim();
  const imageDesc = (pm$("perchancePrompt").value || "").trim();
  if (!name) { pmMessage("Enter a persona name first.", "err"); pm$("personaName").focus(); return null; }
  if (!prompt) { pmMessage("Enter a persona description first.", "err"); pm$("personaDesc").focus(); return null; }

  const personas = pmGetPersonas();
  let id = pm$("personaSel") && pm$("personaSel").value;
  let persona = id ? personas.find(p => String(p.id) === String(id)) : null;
  const now = Date.now();
  if (persona) {
    persona.name = name;
    persona.prompt = prompt;
    persona.imageDesc = imageDesc || persona.imageDesc || "";
    persona.imageDataUrl = pmImageDataUrl || persona.imageDataUrl || "";
    persona.updatedAt = now;
  } else {
    id = "persona_" + now + "_" + Math.random().toString(36).slice(2, 8);
    persona = { id, name, prompt, imageDesc, imageDataUrl: pmImageDataUrl || "", updatedAt: now };
    personas.push(persona);
  }
  if (!pmSavePersonas(personas)) {
    pmMessage("Could not save: browser storage is full (image too large?). Try a smaller image.", "err");
    return null;
  }
  pmRefreshPersonaSelect(id);
  pmMessage("Saved persona: " + name, "ok");
  return persona;
}

/* ================= template select + preview ================= */
function pmPopulateTemplates() {
  const sel = pm$("templateSel");
  if (!sel) return;
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "No template";
  sel.appendChild(blank);
  PM_TEMPLATES.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.file;
    opt.textContent = t.label;
    sel.appendChild(opt);
  });
  sel.value = "";
}

function pmHidePreview() {
  const box = pm$("templatePreview");
  if (!box) return;
  box.classList.remove("show");
  box.textContent = "";
}

function pmFetchTemplate(file) {
  if (!file) return Promise.resolve("");
  if (!pmTemplateCache.has(file)) {
    pmTemplateCache.set(file, (async () => {
      const res = await fetch(PM_TEMPLATE_DIR + file, { cache: "no-store" });
      if (!res.ok) throw new Error("Template not found (HTTP " + res.status + "). Publish persona_templates/ with this page.");
      return await res.text();
    })());
  }
  return pmTemplateCache.get(file);
}

async function pmPreviewTemplate() {
  const file = pm$("templateSel") && pm$("templateSel").value;
  const box = pm$("templatePreview");
  if (!file) { pmHidePreview(); return; }
  if (!box) return;
  const label = PM_TEMPLATES.find(t => t.file === file);
  box.textContent = "Loading " + (label ? label.label : file) + "...";
  box.classList.add("show");
  try {
    box.textContent = await pmFetchTemplate(file);
  } catch (e) {
    box.textContent = "";
    box.classList.remove("show");
    pmMessage("Could not load the template: " + e.message, "err");
  }
}

/* ================= image: paste / upload, always 450x450 ================= */
let pmImageDataUrl = "";
let pmImageMeta = "";

function pmSetImageDataUrl(dataUrl, meta) {
  pmImageDataUrl = dataUrl || "";
  pmImageMeta = meta || "";
  const img = pm$("imgPreview");
  if (img) {
    if (pmImageDataUrl) { img.src = pmImageDataUrl; img.classList.add("show"); }
    else { img.removeAttribute("src"); img.classList.remove("show"); }
  }
  const metaEl = pm$("imgMeta");
  if (metaEl) metaEl.textContent = pmImageDataUrl ? pmImageMeta : "";
}

function pmFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function pmLoadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a valid image."));
    img.src = dataUrl;
  });
}

function pmResizeToSquare(image) {
  // Center-crop to 1:1, then scale to 450x450 (waist-up framing preserved).
  const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = Math.max(0, ((image.naturalWidth || image.width) - side) / 2);
  const sy = Math.max(0, ((image.naturalHeight || image.height) - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = PM_IMG_SIZE;
  canvas.height = PM_IMG_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, side, side, 0, 0, PM_IMG_SIZE, PM_IMG_SIZE);
  return canvas;
}

async function pmApplyImageBlob(blob, sourceLabel) {
  if (!blob) return;
  const type = blob.type || "";
  if (type && type.indexOf("image/") !== 0) { pmMessage("That is not an image file.", "err"); return; }
  if (blob.size > 8 * 1024 * 1024) { pmMessage("That image is over 8 MB - pick a smaller one.", "err"); return; }
  try {
    const dataUrl = await pmFileToDataUrl(blob);
    const image = await pmLoadImage(dataUrl);
    const canvas = pmResizeToSquare(image);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    const kb = Math.round((out.length * 3) / 4 / 1024);
    pmSetImageDataUrl(out, PM_IMG_SIZE + "x" + PM_IMG_SIZE + " - JPEG ~" + kb + " KB - " + sourceLabel);
    pmMessage("Image ready (" + PM_IMG_SIZE + "x" + PM_IMG_SIZE + "). Save Persona to keep it with the persona.", "ok");
  } catch (e) {
    pmMessage("Could not use that image: " + e.message, "err");
  }
}

async function pmPasteImageFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = (item.types || []).find(t => t.indexOf("image/") === 0);
      if (imageType) {
        const blob = await item.getType(imageType);
        await pmApplyImageBlob(blob, "pasted");
        return;
      }
    }
    pmMessage("No image found on the clipboard. Copy an image first, or Upload Image instead.", "err");
  } catch (e) {
    pmMessage("Clipboard read failed. Use Ctrl+V on this page or Upload Image instead.", "err");
  }
}

async function pmCopyPerchance() {
  const text = (pm$("perchancePrompt").value || "").trim();
  if (!text) { pmMessage("There is no image prompt to copy yet - run AI Enhance first.", "err"); return; }
  try {
    await navigator.clipboard.writeText(text);
    pmMessage("Image prompt copied.", "ok");
  } catch (e) {
    pm$("perchancePrompt").select();
    pmMessage("Copy blocked by the browser - the prompt is selected, press Ctrl+C.", "err");
  }
}

/* ================= wiring ================= */
function pmInit() {
  pmPopulateTemplates();
  pmRefreshPersonaSelect("");

  const personaSel = pm$("personaSel");
  if (personaSel) personaSel.addEventListener("change", () => {
    const persona = pmCurrentPersona();
    if (persona) { pmLoadPersonaIntoForm(persona); pmMessage("Loaded persona: " + (persona.name || "Unnamed"), "ok"); }
  });

  const templateSel = pm$("templateSel");
  if (templateSel) templateSel.addEventListener("change", pmHidePreview);

  const previewBtn = pm$("previewTemplateBtn");
  if (previewBtn) previewBtn.addEventListener("click", pmPreviewTemplate);

  const enhanceBtn = pm$("enhanceBtn");
  if (enhanceBtn) enhanceBtn.addEventListener("click", pmAiEnhance);

  const saveBtn = pm$("savePersonaBtn");
  if (saveBtn) saveBtn.addEventListener("click", pmSavePersona);

  const undoBtn = pm$("undoPersonaBtn");
  if (undoBtn) undoBtn.addEventListener("click", pmUndoEnhance);

  const clearBtn = pm$("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", pmClearForm);

  const copyBtn = pm$("copyPerchanceBtn");
  if (copyBtn) copyBtn.addEventListener("click", pmCopyPerchance);

  const uploadBtn = pm$("uploadImageBtn");
  const fileInput = pm$("imageUploadInput");
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) pmApplyImageBlob(file, "uploaded");
      fileInput.value = "";
    });
  }

  const clearImageBtn = pm$("clearImageBtn");
  if (clearImageBtn) clearImageBtn.addEventListener("click", () => { pmSetImageDataUrl("", ""); pmMessage("Image cleared.", "ok"); });

  const backBtn = pm$("backToChatBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    // The chat page was opened first and keeps an in-memory copy of personas,
    // so it must reload (re-read localStorage) to see the persona just saved here.
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
        pmApplyImageBlob(item.getAsFile(), "pasted");
        return;
      }
    }
  });

  pmMessage("");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pmInit);
else pmInit();
