// Match a fact text to the most likely audio segment using token overlap.
export type AudioSegment = { id?: number | string; start: number; end: number; text: string };

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

const STOP = new Set(["para","como","mais","muito","aqui","sobre","esse","essa","isso","tudo","nada","gente","entao","porque","quando","onde","quem","esta","estao","todos","todas","nesse","nessa","numa","nesta","neste"]);

export function findBestSegment(
  text: string,
  segments: AudioSegment[],
  windowSize = 3
): AudioSegment | null {
  if (!text || !Array.isArray(segments) || segments.length === 0) return null;
  const queryTokens = new Set([...tokenize(text)].filter((t) => !STOP.has(t)));
  if (queryTokens.size === 0) return null;

  let best: { idx: number; score: number } | null = null;
  for (let i = 0; i < segments.length; i++) {
    // join window of N consecutive segments to handle short fragments
    const slice = segments.slice(i, i + windowSize);
    const joined = slice.map((s) => s.text).join(" ");
    const segTokens = tokenize(joined);
    let inter = 0;
    for (const t of queryTokens) if (segTokens.has(t)) inter++;
    const score = inter / Math.max(queryTokens.size, 1);
    if (!best || score > best.score) best = { idx: i, score };
  }

  if (!best || best.score < 0.25) return null;
  const slice = segments.slice(best.idx, best.idx + windowSize);
  return {
    start: slice[0].start,
    end: slice[slice.length - 1].end,
    text: slice.map((s) => s.text).join(" "),
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
