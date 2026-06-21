/**
 * AIService — Multi-provider AI wrapper for Skill Next Door.
 *
 * Providers run in a fallback chain (primary first). When a provider is
 * rate-limited / quota-exhausted, the next provider is tried. If ALL
 * configured providers are exhausted, a server-side cooldown is started so
 * the feature reports "unavailable" (and the UI hides it) until it resets.
 *
 * Configure via .env (set one or both keys):
 *   GEMINI_API_KEY=your-gemini-key
 *   GROQ_API_KEY=your-groq-key
 *   AI_PRIMARY=gemini|groq        (optional, default: gemini)
 *   AI_MODEL=optional-model-override
 *   AI_COOLDOWN_MINUTES=45        (optional, default: 45)
 *
 * Legacy fallback: AI_API_KEY + AI_PROVIDER (single provider) still works.
 *
 * All methods return null if AI is unavailable or fails; they never throw.
 */

// ---------- Config / keys ----------

let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Backward-compat with the old single-provider scheme
const LEGACY_KEY = process.env.AI_API_KEY || '';
const LEGACY_PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();
if (LEGACY_KEY && LEGACY_PROVIDER !== 'none') {
    if (LEGACY_PROVIDER === 'gemini' && !GEMINI_API_KEY) GEMINI_API_KEY = LEGACY_KEY;
    if ((LEGACY_PROVIDER === 'groq' || LEGACY_PROVIDER === '') && !GROQ_API_KEY) GROQ_API_KEY = LEGACY_KEY;
}

const AI_PRIMARY = (process.env.AI_PRIMARY || 'gemini').toLowerCase();
const AI_MODEL = process.env.AI_MODEL || null;
const TIMEOUT_MS = 15000;
const COOLDOWN_MS = (parseInt(process.env.AI_COOLDOWN_MINUTES, 10) || 45) * 60 * 1000;

// ---------- Provider Initialisation ----------

let geminiClient = null;
let groqClient = null;

if (GEMINI_API_KEY) {
    try {
        const { GoogleGenAI } = require('@google/genai');
        geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    } catch (err) {
        console.warn('AI Service: Failed to initialise Gemini SDK:', err.message);
    }
}

if (GROQ_API_KEY) {
    try {
        const Groq = require('groq-sdk');
        groqClient = new Groq({ apiKey: GROQ_API_KEY });
    } catch (err) {
        console.warn('AI Service: Failed to initialise Groq SDK:', err.message);
    }
}

function isEnabled() {
    return !!(geminiClient || groqClient);
}

if (isEnabled()) {
    const order = providerOrder().join(' → ');
    console.log(`AI Service: Enabled (chain: ${order})`);
} else {
    console.log('AI Service: Disabled (no GEMINI_API_KEY / GROQ_API_KEY configured)');
}

// ---------- Provider Defaults ----------

const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash-lite';

// ---------- Cooldown (all-providers exhausted) ----------

let cooldownUntil = 0;
function inCooldown() {
    return Date.now() < cooldownUntil;
}
function startCooldown() {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    console.warn(`AI Service: all providers exhausted — cooling down for ${COOLDOWN_MS / 60000} min`);
}

// ---------- Provider chain ----------

function providerOrder() {
    const list = AI_PRIMARY === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];
    return list.filter((p) => (p === 'gemini' && geminiClient) || (p === 'groq' && groqClient));
}

function parseMaybeJson(text, json) {
    if (!json) return { ok: true, value: text };
    try {
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        return { ok: true, value: JSON.parse(cleaned) };
    } catch {
        return { ok: false };
    }
}

// Returns { status: 'ok'|'ratelimited'|'error', value? }
async function callGemini(prompt, { json = false } = {}) {
    if (!geminiClient) return { status: 'error' };
    const models = AI_MODEL ? [AI_MODEL] : [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL];
    for (const model of models) {
        try {
            const config = json ? { responseMimeType: 'application/json' } : {};
            const response = await Promise.race([
                geminiClient.models.generateContent({ model, contents: prompt, config }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), TIMEOUT_MS)),
            ]);
            const text = response.text?.trim() || '';
            if (!text) return { status: 'error' };
            const parsed = parseMaybeJson(text, json);
            return parsed.ok ? { status: 'ok', value: parsed.value } : { status: 'error' };
        } catch (err) {
            const msg = String(err.message || err);
            const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
            console.error(`AI Service (gemini/${model}):`, isQuota ? 'quota exceeded' : msg);
            if (!isQuota) return { status: 'error' };
        }
    }
    return { status: 'ratelimited' };
}

// Returns { status: 'ok'|'ratelimited'|'error', value? }
async function callGroq(prompt, { json = false } = {}) {
    if (!groqClient) return { status: 'error' };
    const models = AI_MODEL ? [AI_MODEL] : [GROQ_DEFAULT_MODEL, GROQ_FALLBACK_MODEL];
    for (const model of models) {
        try {
            const response = await Promise.race([
                groqClient.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 1024,
                    ...(json ? { response_format: { type: 'json_object' } } : {}),
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), TIMEOUT_MS)),
            ]);
            const text = response.choices?.[0]?.message?.content?.trim() || '';
            if (!text) return { status: 'error' };
            const parsed = parseMaybeJson(text, json);
            return parsed.ok ? { status: 'ok', value: parsed.value } : { status: 'error' };
        } catch (err) {
            const msg = String(err.message || err);
            const isRateLimit = msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota');
            console.error(`AI Service (groq/${model}):`, isRateLimit ? 'rate limited' : msg);
            if (!isRateLimit) return { status: 'error' };
        }
    }
    return { status: 'ratelimited' };
}

// ---------- Unified AI Call (with cross-provider fallback) ----------

async function callAI(prompt, { json = false } = {}) {
    if (!isEnabled() || inCooldown()) return null;

    const order = providerOrder();
    let allRateLimited = order.length > 0;

    for (const provider of order) {
        const r = provider === 'gemini' ? await callGemini(prompt, { json }) : await callGroq(prompt, { json });
        if (r.status === 'ok') return r.value;
        if (r.status !== 'ratelimited') allRateLimited = false;
    }

    if (allRateLimited) startCooldown();
    return null;
}

// ---------- Public Methods ----------

const AIService = {
    // Keys exist (feature can exist at all)
    isEnabled,
    // Keys exist AND not in a rate-limit cooldown (feature is usable right now)
    isAvailableNow() {
        return isEnabled() && !inCooldown();
    },

    async normaliseCoachSkill(input, existingSkillNames) {
        if (!this.isAvailableNow()) return null;
        const skillList = existingSkillNames.slice(0, 50).join(', ');
        const prompt = `You are a skill normalisation assistant for a coaching marketplace.

A coach entered this skill: "${input}"

Here are the existing canonical skills in the system:
${skillList}

Determine:
1. Does this input match an existing canonical skill? If so, which one?
2. What confidence level? (high, medium, low)
3. Is this genuinely a new skill not covered by existing ones?

Return a JSON object:
{
  "canonicalSkillSuggestion": "ExistingSkillName or null",
  "confidence": "high|medium|low",
  "isNewSkill": true/false
}

Rules:
- Only suggest high confidence if the match is clearly and obviously correct
- For medium/low confidence or no match, set isNewSkill to true
- Return valid JSON only`;
        return await callAI(prompt, { json: true });
    },

    async improveCoachBio(text, context = {}) {
        if (!this.isAvailableNow()) return null;
        const contextStr = [
            context.skillName ? `Skill: ${context.skillName}` : '',
            context.yearsExp ? `Experience: ${context.yearsExp} years` : '',
            context.headline ? `Headline: ${context.headline}` : '',
        ].filter(Boolean).join('. ');
        const prompt = `You are a writing assistant for an Australian coaching marketplace.

Improve this coach's bio to be clearer, more professional, and appealing to potential students.
Keep the same meaning and facts. Do not invent new claims.
Keep the tone warm and approachable, not corporate.
Keep it concise (2-4 sentences, under 300 characters if possible).
Write in first person.

${contextStr ? `Context: ${contextStr}\n` : ''}
Original bio:
"${text}"

Return ONLY the improved bio text, no quotes or labels.`;
        return await callAI(prompt, { json: false });
    },

    async improveCoachHeadline(text, context = {}) {
        if (!this.isAvailableNow()) return null;
        const contextStr = [
            context.skillName ? `Skill: ${context.skillName}` : '',
            context.yearsExp ? `Experience: ${context.yearsExp} years` : '',
            context.bio ? `Bio: ${context.bio.slice(0, 200)}` : '',
        ].filter(Boolean).join('. ');
        const prompt = `You are a writing assistant for an Australian coaching marketplace.

Generate 4 short, compelling headline options for a coach profile.
Each headline should be under 80 characters.
Make them varied: some professional, some friendly, some highlighting experience.

${contextStr ? `Context: ${contextStr}\n` : ''}
Current headline: "${text}"

Return a JSON array of 4 headline strings. Example:
["Headline option 1", "Headline option 2", "Headline option 3", "Headline option 4"]

Return valid JSON only.`;
        return await callAI(prompt, { json: true });
    },

    async suggestCoachSkillTags(context = {}) {
        if (!this.isAvailableNow()) return null;
        const prompt = `You are a skill tagging assistant for an Australian coaching marketplace.

Based on this coach profile, suggest 3-6 relevant skills or tags.

Headline: "${context.headline || ''}"
Bio: "${context.bio || ''}"
Current skill: "${context.skillName || ''}"

Return a JSON array of skill name strings that this coach likely teaches.
Prioritise common, searchable terms. Keep names short (1-3 words).
Example: ["Piano", "Music Theory", "Keyboard"]

Return valid JSON only.`;
        return await callAI(prompt, { json: true });
    },
};

module.exports = AIService;
