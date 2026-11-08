# chat Commands Reference

Complete list of all commands available in the chat Telegram bot application.

> **Generated:** November 6, 2026  
> **Source:** `commands.go` (transport-neutral command dispatcher)

This reference covers in-chat commands. Executable startup flags (`--port`,
`--host`, and `--version`) are documented in
[startup_flags.md](./startup_flags.md). Background and sandbox launcher files
are shipped separately; there are no `-make-bkgnd` or `-make-sandbox`
command-line flags.

---

## Command Categories

### 📚 Stories & Chapters

| Command | Aliases | Description |
|---------|---------|-------------|
| `story` | — | List story folders |
| `story [n]` | — | Select story folder by number (clears settings/chars, loads its chat history) |
| `story create [name]` | `story new [name]` | Create a new story folder and switch to it |
| `story save [name] [y]` | — | Save current chat as a story snapshot (y overwrites) |
| `story load [name]` | — | Load a saved story snapshot |
| `savepoint` / `sp` | — | List saved savepoints in the current story |
| `savepoint [n]` / `sp [n]` | — | Pick/load listed savepoint by number |
| `savepoint save [name] [y]` / `sp save [name] [y]` | — | Save current chat as a savepoint (y overwrites) |
| `savepoint load [n\|name]` / `sp load [n\|name]` | — | Load a saved savepoint |

> **Note:** Save commands refuse to replace an existing file unless you add `y` after the name.

---

### 👤 Characters

| Command | Aliases | Description |
|---------|---------|-------------|
| `char` / `character` | — | List characters in current story |
| `char 1 -2 3` | — | Multi-toggle characters (prefix `-` to deactivate) |
| `char all off` | — | Deactivate all characters |
| `char edit [n]` | `character edit [n]` | Show character bio |
| `char save [name] [y] [text]` | `character save ...` | Save character bio (y overwrites) |
| `char del [n]` | `character del [n]` | Delete a character |

---

### 👥 Personas (Chats)

| Command | Aliases | Description |
|---------|---------|-------------|
| `persona` / `persona_list` | — | List personas in current chat |
| `persona [n]` | — | Select a persona (single active; option 1 clears it) |
| `persona none` | — | Clear the active persona |
| `persona all off` | — | Deactivate all personas |
| `persona edit [n]` | — | Show persona text |
| `persona save [name] [y] [text]` | — | Save persona text (y overwrites) |

---

### 🎦 Settings

| Command | Aliases | Description |
|---------|---------|-------------|
| `setting` / `settings` | — | List settings in current story |
| `setting 1 -2 3` | — | Multi-toggle settings (prefix `-` to deactivate) |
| `setting all off` | — | Deactivate all settings |
| `setting edit [n]` | — | Show setting description |
| `setting save [name] [y] [text]` | — | Save setting description (y overwrites) |
| `setting del [n]` | — | Delete a setting |

---

### 🎭 Roles

| Command | Aliases | Description |
|---------|---------|-------------|
| `role` / `r` | — | List available roles (🔒 = held by another bot) |
| `role [n]` | — | Switch to role (option 1 unloads it) |
| `role image` / `role i` | — | Role list with a small portrait of each role (`i` is a shortcut) |
| `role none` / `role nono` | — | Unload the role (no role loaded, any bot may use it) |
| `role edit [n]` | — | Get role text to edit |
| `role save [name] [y] [text]` | — | Save role profile (y overwrites) |
| `role del [n]` | — | Delete a role |
| `reload` | — | Reload role from disk |
| `rs [n]` | — | Show current role metadata and a 200-character preview (no LLM call) |
| `role summary` / `rolesummary` | — | Chat mode only. Ask the LLM for a short summary of the current role. The request sends no conversation history and the reply is not added to chat history. |

> **Note:** A role is held by one bot at a time; switching away frees it for others.
---

### 🧠 AI Providers & Models

| Command | Aliases | Description |
|---------|---------|-------------|
| `provider` / `p` | — | List providers (Ollama local/online, llama.cpp, OpenRouter, Google) |
| `provider [n]` / `p [n]` | — | Switch provider by number |
| `model` | — | List available models |
| `model [n]` | — | Switch model by number |
| `model +` | — | Next model (won't go past last) |
| `model -` | — | Previous model (won't go below first) |
| `mf` | — | List models filtered by the last filter name (unfiltered if none) |
| `mf [name]` | — | Store a name filter and list matching models (case-insensitive substring) |
| `mf [n]` | — | Switch to model n from the filtered `.mf` list |
| `mf next` / `mf prev` | — | Cycle within the filtered `.mf` list |
| `think` | — | Toggle thinking on/off (off = preferred, faster) |
| `nothink [on/off]` | `no think [on/off]` | Thinking off/on shortcut for the Ollama API |
| `llmctx [nk]` | `ctxsize [nk]` / `ctx [nk]` | Set/show model context window (e.g., `8k`, `16k`, `32k`) |
| `length [n\|auto]` | — | Set/show approximate response length in words; `auto` disables it |

---
---

### 💾 Conversation & Chats

| Command | Aliases | Description |
|---------|---------|-------------|
| `clear` | — | Back up the current chat, then wipe memory (context) |
| `clean` | — | Wipe memory and delete messages from chat UI |
| `mode [chat\|story]` | `mo` | Toggle history behavior |
| `recap [n]` | — | Summarize last 50 messages using prompt n |
| `ask [text]` | — | Ask a question outside of roleplay context (with history access) |
| `role summary` / `rolesummary` | — | Chat-only LLM role summary; does not use or add to chat history |
| `del` | — | Delete last message + response |
| `resend` | — | Resend last user message |
| `context [n]` | — | Set/show context message limit |
| `history [n] [full] [keep]` / `hs [n] [full] [keep]` | — | Show last n interactions (default 5, truncated to 100 chars). Add `keep` to prevent auto-deletion |
| `backup` / `bak` / `archive` / `ar [name]` | — | Zip this chat/story to `chats/backup/<role>/<role>_<date>[_name].zip` without clearing |

---

### ⚙️ Model Parameters

| Command | Aliases | Description |
|---------|---------|-------------|
| `temp [n]` / `temperature [n]` | — | Set temperature (0.0–2.0) |
| `top_p [n]` / `topp [n]` | — | Set top_p (0.0–1.0) |
| `repeat_penalty [n]` / `rp [n]` | — | Set repeat penalty |
| `seed [n]` | — | Set random seed |
| `num_predict [n]` / `np [n]` | — | Set max tokens to predict |
| `num_gpu [n]` / `ng [n]` | — | Set number of GPU layers |
| `num_thread [n]` / `nt [n]` | — | Set number of CPU threads |

---

### 🔧 System & Utility

| Command | Aliases | Description |
|---------|---------|-------------|
| `help` / `h` | — | Show this help message |
| `status` / `s` | — | Show current bot status and settings |
| `version` | — | Show version information |
| `release` / `rel` | — | Release/version info |
| `web` | — | Show the chat website as a tappable link |
| `web asset` / `web assets` | — | Show the chat asset browser as a tappable link |
| `install [gisturl]` | — | Install a role or story from a public GitHub gist. Roles need `GOCHATAPPROLETAG_<name>.txt` plus `thumb.md` |

---
## Usage Notes

### Common Patterns

1. **Numbered Selection**: Many commands accept a number to select from a list (e.g., `role 3`, `model 2`, `char 1`).
2. **Overwrite Flag**: Save commands support a `y` flag to force overwrite: `role save myrole y New content here`.
3. **Multi-toggle**: Character, setting, and persona commands support space-separated numbers with `-` prefix to deactivate: `char 1 -2 3`.
4. **Context Size Format**: Use `k` suffix for kilobytes: `ctxsize 8k`, `ctxsize 16k`, `ctxsize 32k`.
5. **Auto-completion**: The web UI and Telegram client provide command suggestions.

### Command Prefix

All commands are prefixed with a dot (`.`) when used in chat:
- `.help`
- `.role 3`
- `.mf google`
- `.story create my_story`

---

## Command Aliases Summary

| Primary | Aliases |
|---------|---------|
| `help` | `h` |
| `provider` | `p` |
| `role` | `r` |
| `mode` | `mo` |
| `character` | `char` |
| `persona_list` | `persona` |
| `savepoint` | `sp` |
| `history` | `hs` |
| `backup` | `bak`, `archive`, `ar` |
| `ctxsize` | `ctx` |
| `llmctx` | `ctxsize`, `ctx` |
| `temperature` | `temp` |
| `top_p` | `topp` |
| `repeat_penalty` | `rp` |
| `num_predict` | `np` |
| `num_gpu` | `ng` |
| `num_thread` | `nt` |
| `nothink` | `no think` |
| `release` | `rel` |
| `status` | `s` |

---
## Commands Requiring Provider

Most commands work without a configured provider, but these **require** an active provider:
- `model` (list/select)
- `mf` (filter models by name, then select by number)
- `think` / `nothink`
- `llmctx` / `ctxsize`
- `temp`, `top_p`, `repeat_penalty`, `seed`, `num_predict`, `num_gpu`, `num_thread`
- `ask` (uses LLM)
- `role summary` / `rolesummary` (uses LLM; chat mode only and history-free)
- `recap` (uses LLM)

Commands that work **without** a provider:
- `help`, `h`
- `backup`, `bak`, `archive`, `ar`
- `length`
- `release`, `rel`
- `version`
- `web`
- `install`

---

## Files & Storage Locations

| Data Type | Location |
|-----------|----------|
| Roles | `chats/roles/*.txt` |
| Personas | `chats/personas/*.txt` |
| Stories | `stories/<story_name>/` |
| Characters | `stories/<story_name>/characters/*.txt` |
| Settings | `stories/<story_name>/settings/*.txt` |
| Savepoints | `stories/<story_name>/savepoints/*.zip` |
| Chat History | `chats/backup/<role>/<role>_<date>[_name].zip` |
| Config | `config.yaml` |
| Bot Params | `config/bot_params_<bot_name>.json` |

---

## Review Checklist

Use this section to mark commands for potential deletion:

- [ ] **Story Commands** - `story`, `story create`, `story save`, `story load`, `savepoint`, `sp`
- [ ] **Character Commands** - `char`, `character`, `char edit`, `char save`, `char del`
- [ ] **Persona Commands** - `persona`, `persona_list`, `persona save`, `persona edit`
- [ ] **Setting Commands** - `setting`, `settings`, `setting save`, `setting edit`, `setting del`
- [ ] **Role Commands** - `role`, `r`, `role image`, `role save`, `role del`, `reload`, `rs`, `role summary` / `rolesummary`
- [ ] **Provider/Model Commands** - `provider`, `p`, `model`, `mf`
- [ ] **Thinking Commands** - `think`, `nothink`, `no think`
- [ ] **Context/Length** - `llmctx`, `ctxsize`, `ctx`, `length`
- [ ] **Conversation** - `clear`, `clean`, `mode`, `recap`, `ask`, `role summary` / `rolesummary`, `del`, `resend`, `context`, `history`, `hs`, `backup`, `bak`, `archive`, `ar`
- [ ] **Model Parameters** - `temp`, `temperature`, `top_p`, `topp`, `repeat_penalty`, `rp`, `seed`, `num_predict`, `np`, `num_gpu`, `ng`, `num_thread`, `nt`
- [ ] **System** - `help`, `h`, `status`, `s`, `version`, `release`, `rel`, `web`, `install`

---

*This document is auto-generated from the command dispatcher in `commands.go`. Update by re-running the generation script or editing manually.*