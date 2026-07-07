// Vercel serverless function
// POST { currentTitle, targetTitle, bullets } -> { reframed: [...] }
// Requires env var GROQ_API_KEY set in Vercel project settings.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentTitle, targetTitle, bullets } = req.body || {};

  if (!currentTitle || !targetTitle || !bullets || !bullets.trim()) {
    return res.status(400).json({ error: 'Missing currentTitle, targetTitle, or bullets' });
  }

  const systemPrompt = `You reframe a person's real job history so it reads as relevant to a target role — without inventing anything.

RULES (do not break these):
1. NEVER invent numbers, metrics, tools, outcomes, or responsibilities that are not stated or clearly implied by the input.
2. Do not exaggerate scope (e.g. do not turn "helped with" into "led").
3. You may: surface transferable skills already present in the text, use vocabulary common to the target role, reorder to foreground what's relevant, and cut irrelevant detail.
4. If a bullet has nothing relevant to the target role, say so plainly instead of forcing a connection.
5. Keep the person's voice: no corporate fluff, no "spearheaded," "leveraged," "synergy." Plain, confident, specific language.

Return ONLY valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "reframed": [
    { "original": "...", "rewritten": "...", "note": "short note on what changed and why, or why nothing could be reframed" }
  ]
}`;

  const userPrompt = `Current title: ${currentTitle}
Target title: ${targetTitle}

Bullets / job history (one per line):
${bullets}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error:', errText);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse model output:', content);
      return res.status(502).json({ error: 'Could not parse model response' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
