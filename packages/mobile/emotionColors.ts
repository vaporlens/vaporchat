// VaporLens's colors for the emotions it finds in reviews, the light shades of its dark theme
const AMBER = '#fcd34d';
const EMERALD = '#6ee7b7';
const ORANGE = '#fdba74';
const RED = '#fca5a5';
const FUCHSIA = '#f0abfc';
const GREEN = '#86efac';
const SKY = '#7dd3fc';
const ROSE = '#fda4af';
const BLUE = '#93c5fd';
const CYAN = '#67e8f9';

const EMOTIONS: Record<string, string> = {
  frustration: AMBER,
  satisfaction: EMERALD,
  disappointment: '#d6d3d1',
  excitement: ORANGE,
  enjoyment: '#5eead4',
  anger: RED,
  addiction: FUCHSIA,
  appreciation: GREEN,
  hope: SKY,
  challenge: '#a5b4fc',
  admiration: '#c4b5fd',
  joy: '#fde047',
  love: ROSE,
  amusement: '#bef264',
  caution: AMBER,
  annoyance: ORANGE,
  sarcasm: '#d8b4fe',
  loyalty: BLUE,
  confusion: '#cbd5e1',
  immersion: CYAN,
  surprise: '#f9a8d4',
  boredom: '#d1d5db',
  sadness: BLUE,
  awe: FUCHSIA,
  engagement: CYAN,
  optimism: EMERALD,
  acceptance: GREEN,
  criticism: RED,
  concern: AMBER,
  hopelessness: '#d4d4d8',
  understanding: SKY,
  discomfort: ROSE,
};

/** The color VaporLens shows an emotion in, sky blue for ones it has no color for. */
export function emotionColor(emotion: string) {
  return (
    EMOTIONS[
      emotion
        .replace(/[^\w\s]/g, '')
        .trim()
        .toLowerCase()
    ] ?? SKY
  );
}
