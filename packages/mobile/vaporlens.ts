// VaporLens (vaporlens.app) sums up a game's Steam reviews.
const API_URL = 'https://vaporlens.app/api/app/';
const PAGE_URL = 'https://vaporlens.app/app/';

export interface ReviewPoint {
  point: string;
  explanation: string;
  /** 0 to 1 */
  importance: number;
}

/** Lower scores are better: 0 is no problem, 100 is all problems. */
interface FeatureScan {
  score: number;
  verdict: string;
  summary: string;
}

export interface HardwareSegment {
  label: string;
  /** reviews in this group */
  count: number;
  outcome: 'positive' | 'mixed' | 'negative';
  note: string;
}

interface PlayerArchetype {
  archetypeName: string;
  playstyle: string;
  recommendationStance: string;
}

/** What VaporLens found in a game's reviews, only what the app shows. */
export interface VaporlensReport {
  positives?: ReviewPoint[];
  negatives?: ReviewPoint[];
  gameplay?: ReviewPoint[];
  performance?: ReviewPoint[];
  recommendations?: ReviewPoint[];
  emotions?: ReviewPoint[];
  hardware?: { summary?: string; segments?: HardwareSegment[] };
  featureScans?: {
    steamDeckScan?: FeatureScan;
    protonLinuxScan?: FeatureScan;
    mtxScan?: FeatureScan;
    modScan?: FeatureScan;
    wikiScan?: FeatureScan;
  };
  featureExtractions?: {
    priceExtraction?: { priceRangeUsd?: { min?: number; max?: number } };
    playtimeExtraction?: {
      playtimeHours?: {
        storyCompletion?: number | null;
        gameCompletion?: number | null;
        sessionLength?: number | null;
      };
    };
    timeToFunExtraction?: {
      stance?: string;
      summary?: string;
      timeToAnchorMinutes?: number | null;
    };
    playerArchetypesExtraction?: { archetypes?: PlayerArchetype[] };
  };
}

export function vaporlensUrl(appid: number) {
  return `${PAGE_URL}${appid}`;
}

/** The review analysis of a game, null when VaporLens hasn't analyzed it. */
export async function getVaporlensReport(
  appid: number,
): Promise<VaporlensReport | null> {
  const response = await fetch(`${API_URL}${appid}`);
  // a 404 for games it hasn't analyzed
  if (!response.ok) return null;
  return (await response.json()) as VaporlensReport;
}
