# docs

Internal notes. **Nothing in this folder is part of the site and nothing here should be
published** — the deployable page is `index.html` plus `css/` and `js/`.

## `ai prompt.txt`, `ai_prompt2.txt`

Prompts used while trying to get other LLMs to generate this landing page. The results were
not usable, so the page was written directly instead. Kept only for reference.

Neither file is linked from `index.html` or from any script — verified — so moving them here
changes nothing about how the page behaves.

`ai_prompt2.txt` contains the literal string `Character.AI` (line 63: an instruction *not* to
name that product), which is why it previously sat in the web root and needed a decision.
Now that it is here it is simply never served.
