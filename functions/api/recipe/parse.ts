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

const MAX_CHARS = 12_000;

const SYSTEM = `You extract recipes from messy pasted text.
Return ONLY a single JSON object (no markdown fences) with this shape:
{
  "title": string,
  "servings": number | null,
  "ingredients": [ { "name": string, "quantity": string | null, "unit": string | null, "note": string | null } ],
  "instructions": string | null
}
Rules:
- ingredients must be shopping-useful (name is the food item)
- quantity is a number or simple fraction string when present
- unit is tbsp, cups, g, ml, etc. when present
- skip non-ingredient lines (ads, nutrition, "print recipe")
- if servings unknown use null
- instructions: short combined steps or null`;

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

async function aiParse(ai: AiBinding, text: string): Promise<ParsedRecipe | null> {
  const result = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Extract the recipe from this text:\n\n${text.slice(0, MAX_CHARS)}`,
      },
    ],
    max_tokens: 2048,
  });

  let content = '';
  if (typeof result === 'string') content = result;
  else if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.response === 'string') content = r.response;
    else if (typeof r.text === 'string') content = r.text;
    else if (typeof r.result === 'string') content = r.result;
  }
  if (!content) return null;

  try {
    const parsed = JSON.parse(stripFences(content));
    return normalizeParsed(parsed, 'ai');
  } catch {
    // try to find first {...}
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return normalizeParsed(JSON.parse(m[0]), 'ai');
    } catch {
      return null;
    }
  }
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
  if (text.length > MAX_CHARS) {
    return jsonResponse({ error: `text too long (max ${MAX_CHARS} characters)` }, 400);
  }

  if (context.env.AI) {
    try {
      const aiResult = await aiParse(context.env.AI, text);
      if (aiResult && aiResult.ingredients.length > 0) {
        return jsonResponse(aiResult);
      }
    } catch (err) {
      // fall through to heuristic
      console.error('recipe AI parse failed', err);
    }
  }

  const heur = heuristicParse(text);
  if (heur.ingredients.length === 0) {
    return jsonResponse(
      {
        error:
          'Could not find ingredients. Try pasting a clearer list, or add the recipe manually.',
        parser: 'heuristic',
      },
      422,
    );
  }
  return jsonResponse(heur);
};

export const onRequestGet: PagesFunction = async () =>
  jsonResponse({
    ok: true,
    path: '/api/recipe/parse',
    method: 'POST',
    body: { text: 'string' },
  });
