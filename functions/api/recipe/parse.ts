/**
 * POST /api/recipe/parse
 * Body: { text: string }
 * Returns structured recipe JSON for the Recipes form.
 *
 * Prefer Workers AI (binding name: AI). If unbound or failing, uses a
 * deterministic line parser so Phase B still works without a paid key.
 *
 * Cloudflare dashboard → Pages → Settings → Functions → Workers AI binding:
 *   Variable name: AI
 *
 * ⚠️ SECURITY / COST NOTE — read before deploying:
 * This endpoint is public (any Cloudflare Pages Function is, by default) and
 * every successful call triggers a real, billed Workers AI inference. As
 * shipped, there is no check that the caller is a signed-in family member —
 * anyone who finds this URL could script requests against it and run up
 * inference costs with no limit, the same class of problem as the earlier
 * Emby proxy (a public endpoint that costs real money/access per hit needs
 * *something* gating it, not just a narrow allowlist of what it does).
 *
 * The Origin check below only catches requests that send a *mismatched*
 * Origin header (e.g. another website's client-side JS calling this on a
 * visitor's behalf) — it does nothing against a bare curl/script that omits
 * the Origin header entirely, which is the more likely form this kind of
 * abuse actually takes. It is NOT a real security boundary on its own, same
 * as we learned firsthand when debugging the Emby proxy's Cloudflare rules.
 * Treat it as one small speed bump, not a lock.
 *
 * For an actual fix, do ONE of these (both are outside what this file alone
 * can guarantee — same as the Emby API key living in Cloudflare env vars
 * rather than code):
 *   1. Add a Cloudflare Rate Limiting Rule on `/api/recipe/parse` in the
 *      dashboard (Rules → Rate limiting rules) — e.g. cap requests per IP
 *      per minute. Quick, no code change, doesn't require touching auth.
 *   2. Verify the caller is a real signed-in family member by checking their
 *      Firebase ID token server-side (fetch Google's public JWKS, verify the
 *      RS256 signature + issuer + audience via the Workers runtime's Web
 *      Crypto API). Stronger, but meaningfully more code — worth doing if
 *      (1) alone doesn't feel sufficient once this is live.
 * Do at least (1) before relying on this in production.
 */

const ALLOWED_ORIGINS = new Set(['https://greenhq.io', 'https://www.greenhq.io']);

type AiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

type Env = {
  AI?: AiBinding;
};

export type ParsedIngredient = {
  name: string;
  quantity?: string;
  unit?: string;
  note?: string;
};

export type ParsedRecipe = {
  title: string;
  servings?: number;
  ingredients: ParsedIngredient[];
  instructions?: string;
  source?: string;
  /** "ai" | "heuristic" — so the UI can show how it was parsed */
  parser: 'ai' | 'heuristic';
};

// Two different limits, previously conflated as one:
// - MAX_INPUT_CHARS: how much raw pasted text we accept from the client at
//   all. Recipe blogs routinely run 5,000-15,000+ characters once you count
//   the life story before the recipe, so this needs real headroom — reject
//   too aggressively here and a long, legitimate paste never even reaches
//   windowForModel() below to be trimmed sensibly; it just hard-fails.
// - MAX_MODEL_CHARS: how much of that we actually send to any one model
//   call, after windowForModel() has already prioritized the useful part.
//   Kept modest so the smaller fallback models' context windows are never
//   a concern regardless of how long the raw accepted paste was.
const MAX_INPUT_CHARS = 40_000;
const MAX_MODEL_CHARS = 12_000;

const SYSTEM = `You extract recipes from messy text copy-pasted off recipe websites.
Reply with ONLY one JSON object. No markdown, no commentary, no code fences.
Shape:
{"title":"string","servings":number|null,"ingredients":[{"name":"string","quantity":"string|null","unit":"string|null","note":"string|null"}],"instructions":"string|null"}

Recipe pages are messy — apply ALL of these:
- IGNORE: nav menus, ads, "Jump to Recipe" links, author life-story/blog text,
  ratings/review counts, prep/cook/total time lines, nutrition facts, equipment
  lists, "Rate this recipe", related-recipe links, comments.
- Section headers like "For the sauce:", "For the topping:", "Marinade:" are
  NOT ingredients — skip the header line itself, but keep collecting every
  ingredient under it into the same flat ingredients array (don't group by
  sub-recipe, we only need one combined shopping-relevant list).
- ingredients[].name = the plain food item only, suitable for a shopping list
  (e.g. "onion", not "onion, diced" and not "large yellow onion"). Move prep
  instructions (diced/minced/chopped/melted/softened), descriptive size
  words (large/small/ripe), and markers like "(optional)" or "(divided)"
  into note instead — e.g. "2 onions, diced" -> name "onion", note "diced".
- quantity: normalize mixed numbers and unicode fractions to a plain string,
  e.g. "1½" or "1 1/2" -> "1.5"; "½" or "1/2" -> "0.5". For a range like
  "2-3 cloves" use the lower number ("2") and put the range in note
  ("2-3 in original"). If there's truly no quantity (e.g. "salt to taste",
  "black pepper"), use null and put "to taste" in note if present.
- unit: only real units (cup, tbsp, tsp, g, kg, ml, l, oz, lb, clove, can,
  pinch, etc.) — descriptive words like "large" or "medium" are not units,
  fold them into note instead, never invent a unit that isn't in the text.
- servings: a plain number from "serves", "servings", or "yield" lines, else
  null — never guess one that isn't stated.
- instructions: the numbered/step method text only, combined into one string
  with steps on their own lines, or null if genuinely absent.`;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return t.trim();
}

function normalizeParsed(raw: unknown, parser: 'ai' | 'heuristic'): ParsedRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const ingsIn = Array.isArray(o.ingredients) ? o.ingredients : [];
  const ingredients: ParsedIngredient[] = [];
  for (const row of ingsIn) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const quantity =
      r.quantity === null || r.quantity === undefined
        ? undefined
        : String(r.quantity).trim() || undefined;
    const unit =
      r.unit === null || r.unit === undefined ? undefined : String(r.unit).trim() || undefined;
    const note =
      r.note === null || r.note === undefined ? undefined : String(r.note).trim() || undefined;
    ingredients.push({ name, quantity, unit, note });
  }
  if (!title && ingredients.length === 0) return null;
  let servings: number | undefined;
  if (typeof o.servings === 'number' && Number.isFinite(o.servings) && o.servings > 0) {
    servings = o.servings;
  } else if (typeof o.servings === 'string' && o.servings.trim()) {
    const n = parseFloat(o.servings);
    if (Number.isFinite(n) && n > 0) servings = n;
  }
  const instructions =
    typeof o.instructions === 'string' && o.instructions.trim()
      ? o.instructions.trim()
      : undefined;
  return {
    title: title || 'Untitled recipe',
    servings,
    ingredients,
    instructions,
    parser,
  };
}

/** Best-effort parse without AI — ingredients as bullet/number lines, qty unit name. */
function heuristicParse(text: string): ParsedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = 'Untitled recipe';
  for (const line of lines.slice(0, 8)) {
    if (/^ingredients?\b/i.test(line)) continue;
    if (/^directions?\b|^method\b|^instructions?\b|^steps?\b/i.test(line)) continue;
    if (line.length > 3 && line.length < 80 && !/^\d+[\).]/.test(line)) {
      title = line.replace(/^#+\s*/, '');
      break;
    }
  }

  let servings: number | undefined;
  const servMatch = text.match(/\b(?:serves|servings?|yield)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
  if (servMatch) servings = parseFloat(servMatch[1]!);

  const ingredients: ParsedIngredient[] = [];
  let inIng = false;
  let inInstr = false;
  const instrLines: string[] = [];

  for (const line of lines) {
    if (/^ingredients?\b/i.test(line)) {
      inIng = true;
      inInstr = false;
      continue;
    }
    if (/^directions?\b|^method\b|^instructions?\b|^steps?\b|^preparation\b/i.test(line)) {
      inIng = false;
      inInstr = true;
      continue;
    }

    if (inInstr) {
      instrLines.push(line.replace(/^\d+[\).]\s*/, ''));
      continue;
    }

    // Treat list-like lines as ingredients when in section or globally if no section
    const cleaned = line.replace(/^[-*•·]\s+/, '').replace(/^\d+[\).]\s+/, '');
    const looksLikeIng =
      inIng ||
      /^(\d+([\.,]\d+)?|\d+\s*\/\s*\d+|½|¼|¾|⅓|⅔)/.test(cleaned) ||
      (inIng === false && ingredients.length > 0 && cleaned.length < 60);

    if (!looksLikeIng && !inIng) continue;
    if (/^ingredients?\b/i.test(cleaned)) continue;

    const m = cleaned.match(
      /^((?:\d+([\.,]\d+)?)|(?:\d+\s*\/\s*\d+)|[½¼¾⅓⅔])\s*([a-zA-Z]+\.?)?\s+(.+)$/,
    );
    if (m) {
      const quantity = m[1]!.replace(/\s+/g, '');
      let unit = m[3]?.replace(/\.$/, '') || undefined;
      let name = m[4]!.trim();
      // "2 cups flour" → unit cups; "2 large eggs" → no unit if "large" isn't a unit
      const units = new Set([
        'cup','cups','tbsp','tsp','teaspoon','teaspoons','tablespoon','tablespoons',
        'g','kg','ml','l','oz','lb','lbs','pound','pounds','clove','cloves',
        'can','cans','pkg','package','pinch','handful',
      ]);
      if (unit && !units.has(unit.toLowerCase())) {
        name = `${unit} ${name}`.trim();
        unit = undefined;
      }
      const noteMatch = name.match(/\(([^)]+)\)\s*$/);
      let note: string | undefined;
      if (noteMatch) {
        note = noteMatch[1];
        name = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
      }
      ingredients.push({ name, quantity, unit, note });
      continue;
    }

    if (inIng && cleaned.length > 1) {
      ingredients.push({ name: cleaned });
    }
  }

  // Fallback: any short dashed lines in whole text
  if (ingredients.length === 0) {
    for (const line of lines) {
      const cleaned = line.replace(/^[-*•·]\s+/, '');
      if (cleaned !== line && cleaned.length > 2 && cleaned.length < 80) {
        ingredients.push({ name: cleaned });
      }
    }
  }

  return {
    title,
    servings,
    ingredients,
    instructions: instrLines.length ? instrLines.join('\n') : undefined,
    parser: 'heuristic',
  };
}

/**
 * Current catalog models (llama-3.1-8b-instruct base was deprecated 2026-05-30).
 * Ordered strongest-first, not fastest-first: this is a low-frequency,
 * paste-a-recipe-a-few-times-a-week feature, not a high-throughput API, so
 * accuracy matters more than shaving a second of latency. gemma-4-26b-a4b-it
 * is a 26B MoE model (4B active) — meaningfully more capable at following a
 * strict schema than the two smaller fallbacks, and confirmed to support
 * JSON Schema mode (see JSON_SCHEMA below), which the smaller models may or
 * may not honor as reliably.
 */
const AI_MODELS = [
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/meta/llama-3.2-3b-instruct',
] as const;

/**
 * Workers AI JSON Mode (OpenAI-compatible response_format). When a model
 * honors this, its output is constrained to match this schema server-side —
 * we're no longer just hoping the model replies with clean JSON and no
 * stray commentary/markdown, which was almost certainly the single biggest
 * source of "hit or miss" results. Models that don't support it simply
 * ignore the field, so this is safe to send unconditionally; runOneModel
 * below still falls back to free-text extraction either way.
 */
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: ['number', 'null'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: ['string', 'null'] },
          unit: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
        required: ['name'],
      },
    },
    instructions: { type: ['string', 'null'] },
  },
  required: ['title', 'ingredients'],
};

/**
 * Recipe blogs routinely put a multi-paragraph life story, ads, and a "Jump
 * to Recipe" link before the actual ingredient list — often thousands of
 * characters of it. A blind slice(0, MAX_MODEL_CHARS) from the *start* of a long
 * paste can cut off before ever reaching the ingredients/instructions,
 * which is a very plausible cause of inconsistent results depending on how
 * verbose a given site's preamble is. If the text is short enough, send it
 * as-is; if it's long, keep a short prefix (title context) plus start the
 * real window a bit before the first "ingredient" mention so the parts that
 * actually matter are prioritized within the budget instead of the top of
 * the page.
 */
function windowForModel(text: string): string {
  if (text.length <= MAX_MODEL_CHARS) return text;
  const idx = text.search(/ingredients?\b/i);
  if (idx < 0) return text.slice(0, MAX_MODEL_CHARS); // no marker found, fall back to prefix
  const leadIn = 300; // keep a little text before "Ingredients" for the title
  const start = Math.max(0, idx - leadIn);
  const prefix = start > 0 ? text.slice(0, Math.min(leadIn, start)) + '\n…\n' : '';
  return (prefix + text.slice(start)).slice(0, MAX_MODEL_CHARS);
}

function extractModelText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  for (const key of ['response', 'text', 'result', 'output'] as const) {
    if (typeof r[key] === 'string' && (r[key] as string).trim()) return r[key] as string;
  }
  if (Array.isArray(r.descriptions) && r.descriptions[0]) return String(r.descriptions[0]);
  if (r.data && typeof r.data === 'object') {
    const d = r.data as Record<string, unknown>;
    if (typeof d.response === 'string') return d.response;
  }
  // Some chat models return message content arrays
  if (Array.isArray(r.choices) && r.choices[0] && typeof r.choices[0] === 'object') {
    const c = r.choices[0] as Record<string, unknown>;
    if (typeof c.text === 'string') return c.text;
    if (c.message && typeof c.message === 'object') {
      const msg = c.message as Record<string, unknown>;
      if (typeof msg.content === 'string') return msg.content;
    }
  }
  return '';
}

/**
 * JSON Schema mode (response_format) returns an already-parsed OBJECT under
 * `response` (or nested under `data.response`), not a string — a model that
 * honors response_format did its job perfectly and this must be checked
 * *before* falling through to free-text extraction, or a fully successful
 * JSON-mode call would be silently treated as a miss.
 */
function extractModelObject(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.response && typeof r.response === 'object' && !Array.isArray(r.response)) {
    return r.response as Record<string, unknown>;
  }
  if (r.data && typeof r.data === 'object') {
    const d = r.data as Record<string, unknown>;
    if (d.response && typeof d.response === 'object' && !Array.isArray(d.response)) {
      return d.response as Record<string, unknown>;
    }
  }
  return null;
}

/** Pull the first balanced {...} object from model prose. */
function extractJsonObject(content: string): string | null {
  const cleaned = stripFences(content);
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

function parseModelJson(content: string): ParsedRecipe | null {
  if (!content) return null;
  const candidates = [stripFences(content)];
  const extracted = extractJsonObject(content);
  if (extracted) candidates.unshift(extracted);

  for (const c of candidates) {
    try {
      const parsed = normalizeParsed(JSON.parse(c), 'ai');
      if (parsed && parsed.ingredients.length > 0) return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function runOneModel(
  ai: AiBinding,
  model: string,
  text: string,
): Promise<{ parsed: ParsedRecipe | null; rawPreview: string; error?: string }> {
  const userContent =
    `Return JSON only for this recipe text.\n\n` +
    `Example input:\n` +
    `"Grandma's Chicken Soup\nJump to Recipe\nWhen I was a kid...(life story)...\n` +
    `Prep: 10 min  Cook: 40 min  Serves: 4\nFor the broth:\n- 1 1/2 lbs chicken thighs\n` +
    `- 2 large carrots, diced\n- salt and pepper, to taste\nFor the noodles:\n` +
    `- 8 oz egg noodles (optional)\nInstructions\n1. Simmer chicken 30 min.\n` +
    `2. Add noodles, cook 8 min.\nNutrition Facts: 320 cal..."\n\n` +
    `Example output:\n` +
    `{"title":"Grandma's Chicken Soup","servings":4,"ingredients":[` +
    `{"name":"chicken thighs","quantity":"1.5","unit":"lbs","note":null},` +
    `{"name":"carrot","quantity":"2","unit":null,"note":"large, diced"},` +
    `{"name":"salt and pepper","quantity":null,"unit":null,"note":"to taste"},` +
    `{"name":"egg noodles","quantity":"8","unit":"oz","note":"optional"}` +
    `],"instructions":"Simmer chicken 30 min.\\nAdd noodles, cook 8 min."}\n\n` +
    `Now extract this recipe text:\n${windowForModel(text)}`;

  const baseInput: Record<string, unknown> = {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ],
    // Real recipes can have 20+ ingredients plus a full method — 1024 was
    // tight enough to truncate mid-JSON on longer/more complex recipes,
    // which produces invalid JSON that looks like a random model failure.
    max_tokens: 2048,
    response_format: { type: 'json_schema', json_schema: JSON_SCHEMA },
  };

  // Gemma 4 reasoning models: disable thinking so we get JSON, not chain-of-thought
  if (model.includes('gemma')) {
    baseInput.chat_template_kwargs = { enable_thinking: false };
  }

  try {
    const result = await ai.run(model, baseInput);
    // JSON Schema mode succeeded: response is already a parsed object.
    const obj = extractModelObject(result);
    if (obj) {
      const parsed = normalizeParsed(obj, 'ai');
      if (parsed && parsed.ingredients.length > 0) {
        return { parsed, rawPreview: JSON.stringify(obj).slice(0, 240) };
      }
    }
    // Fall back to free-text extraction for models that ignored response_format.
    const content = extractModelText(result);
    const parsed = parseModelJson(content);
    return {
      parsed,
      rawPreview: (content || JSON.stringify(result)).slice(0, 240),
      error: parsed ? undefined : 'no usable JSON ingredients',
    };
  } catch (err) {
    return {
      parsed: null,
      rawPreview: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function aiParse(ai: AiBinding, text: string): Promise<ParsedRecipe | null> {
  let lastErr = '';
  for (const model of AI_MODELS) {
    const { parsed, rawPreview, error } = await runOneModel(ai, model, text);
    if (parsed && parsed.ingredients.length > 0) return parsed;
    lastErr = `${model}: ${error || 'failed'}${rawPreview ? ` | preview: ${rawPreview}` : ''}`;
    console.error('recipe AI model miss', lastErr);
  }
  throw new Error(lastErr || 'All AI models failed');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const origin = context.request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  let body: { text?: string };
  try {
    body = (await context.request.json()) as { text?: string };
  } catch {
    return jsonResponse({ error: 'Expected JSON body { text }' }, 400);
  }
  const text = (body.text || '').trim();
  if (!text) return jsonResponse({ error: 'text is required' }, 400);
  if (text.length > MAX_INPUT_CHARS) {
    return jsonResponse({ error: `text too long (max ${MAX_INPUT_CHARS} characters)` }, 400);
  }

  const aiBound = Boolean(context.env.AI);
  let aiError: string | undefined;

  if (context.env.AI) {
    try {
      const aiResult = await aiParse(context.env.AI, text);
      if (aiResult && aiResult.ingredients.length > 0) {
        return jsonResponse({ ...aiResult, aiBound: true });
      }
      aiError = 'AI returned no usable ingredients';
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
      console.error('recipe AI parse failed', err);
    }
  } else {
    aiError = 'Workers AI binding "AI" is not configured on this deployment';
  }

  const heur = heuristicParse(text);
  if (heur.ingredients.length === 0) {
    return jsonResponse(
      {
        error:
          'Could not find ingredients. Try pasting a clearer list, or add the recipe manually.',
        parser: 'heuristic',
        aiBound,
        aiError,
      },
      422,
    );
  }
  return jsonResponse({ ...heur, aiBound, aiError });
};

export const onRequestGet: PagesFunction<Env> = async (context) =>
  jsonResponse({
    ok: true,
    path: '/api/recipe/parse',
    method: 'POST',
    body: { text: 'string' },
    /** false = Workers AI binding not attached to this deployment */
    aiBound: Boolean(context.env.AI),
  });
