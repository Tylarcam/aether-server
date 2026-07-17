/**
 * CEO Brief generation from a raw transcript (Groq chat completions).
 * Brief is additive metadata — never replaces the transcript.
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEO_BRIEF_MODEL = 'llama-3.3-70b-versatile';
const MAX_TRANSCRIPT_CHARS = 100_000;

const CAPTION_SOURCES = new Set(['captions']);

/**
 * @param {string} [source] - history item `source` (service id)
 * @returns {'captions'|'STT'}
 */
export function transcriptProvenanceLabel(source) {
  return CAPTION_SOURCES.has(source) ? 'captions' : 'STT';
}

/**
 * Build the exact CEO Brief system+user prompt from history fields + transcript.
 * @param {Object} opts
 * @param {string} opts.text
 * @param {string} [opts.title]
 * @param {string} [opts.url]
 * @param {string} [opts.author]
 * @param {string} [opts.source]
 * @param {number|null} [opts.durationMin]
 */
export function buildCeoBriefPrompt({
  text,
  title = 'Untitled',
  url = '',
  author = '',
  source = '',
  durationMin = null,
}) {
  const videoTitle = title || 'Untitled';
  const channel = author || '—';
  const length =
    typeof durationMin === 'number' && Number.isFinite(durationMin)
      ? `~${Math.max(1, Math.round(durationMin))} min`
      : '—';
  const provenance = transcriptProvenanceLabel(source);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const transcript = (text || '').slice(0, MAX_TRANSCRIPT_CHARS);

  return `Transform the transcript below into a CEO Brief. Use EXACTLY this structure. Ground every claim in the transcript only — do not web-search to fill gaps. If non-technical, omit the Technology bullets. Playbook actions must be verb-first and executable within days (effort S/M/L).

# CEO Brief — ${videoTitle}
**Source:** ${url || '—'}
**Channel:** ${channel} | **Length:** ${length} | **Transcript:** ${provenance}

{3–5 sentences: thesis, why it matters, so-what for us.}

## Subject & topics
- {Topic cluster — one-line takeaway}
- {Topic cluster — one-line takeaway}

## Technology (omit if N/A)
- **What they use:** {stack/tools named}
- **How they use it:** {actual application; demo vs production signals}
- **Maturity/hype gap:** {what is proven vs claimed}

## Edges & wedges
- **Edges (where this breaks):** {limits, costs, blockers, oversold claims}
- **Wedges (asymmetric bets):** {openings a small/fast player could exploit}

## Fast implementation playbook
| # | Action | Effort | Why now |
|---|--------|--------|---------|
| 1 | {verb-first action} | S/M/L | {reason} |

## Claims to verify
- {anything that sounds like marketing rather than evidence}

## Confidence
{One line: transcript quality caveats (auto-captions/STT), coverage gaps.}

Save as: CEO Brief — ${dateStamp} — ${videoTitle}

--- TRANSCRIPT ---
${transcript}`;
}

/**
 * Call Groq chat to produce a CEO Brief markdown string.
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.text
 * @param {string} [opts.title]
 * @param {string} [opts.url]
 * @param {string} [opts.author]
 * @param {string} [opts.source]
 * @param {number|null} [opts.durationMin]
 * @returns {Promise<string>}
 */
export async function generateCeoBrief({
  apiKey,
  text,
  title,
  url,
  author,
  source,
  durationMin = null,
}) {
  if (!apiKey) {
    throw new Error('Groq API key required to generate CEO Brief');
  }
  if (!text?.trim()) {
    throw new Error('No transcript text to brief');
  }

  const prompt = buildCeoBriefPrompt({
    text,
    title,
    url,
    author,
    source,
    durationMin,
  });

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CEO_BRIEF_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You write CEO Briefs from transcripts only. Follow the user template structure exactly. Never invent facts not present in the transcript. Output only the brief markdown — no preamble.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || `Groq chat error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const brief = data?.choices?.[0]?.message?.content?.trim();
  if (!brief) {
    throw new Error('No CEO Brief content returned');
  }
  return brief;
}
