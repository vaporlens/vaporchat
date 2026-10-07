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
  /** -1 when it couldn't tell */
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

export interface Hardware {
  summary: string;
  /** reviews that told their hardware */
  sampleSize: number;
  /** of all reviews */
  coveragePct: number;
  audienceSkew: string;
  segments: HardwareSegment[];
  caveats: string[];
}

interface PlayerArchetype {
  archetypeName: string;
  playstyle: string;
  recommendationStance: 'buy' | 'sale' | 'deep sale' | 'no buy';
  experienceLevel: 'newcomer' | 'familiar' | 'veteran' | 'mixed';
  primaryMotivation: string;
  /** what these players call themselves */
  selfIdentifyingLabels: string[];
  /** other games they play */
  referenceGames: string[];
  /** why vaporlens sees them as a group */
  reasoning: string;
}

/** What VaporLens found in a game's reviews, only what the app shows. */
export interface VaporlensReport {
  /** a few short takeaways */
  summary?: string[];
  positives?: ReviewPoint[];
  negatives?: ReviewPoint[];
  gameplay?: ReviewPoint[];
  performance?: ReviewPoint[];
  recommendations?: ReviewPoint[];
  emotions?: ReviewPoint[];
  hardware?: Hardware;
  featureScans?: {
    /** its score is the share of negative reviews */
    reviewMix?: FeatureScan;
    steamDeckScan?: FeatureScan;
    protonLinuxScan?: FeatureScan;
    mtxScan?: FeatureScan;
    modScan?: FeatureScan;
    wikiScan?: FeatureScan;
  };
  featureExtractions?: {
    priceExtraction?: {
      reasoning: string;
      priceRangeUsd: { min: number; max: number };
    };
    playtimeExtraction?: {
      reasoning: string;
      playtimeHours: {
        gameCompletion: number | null;
        storyCompletion: number | null;
        sessionLength: number | null;
        endgame: number | null;
      };
    };
    timeToFunExtraction?: {
      summary: string;
      stance:
        | 'fun immediately'
        | 'clicks after'
        | 'never clicks'
        | 'fun then drops';
      /** the moment it gets fun */
      anchor: string | null;
      timeToAnchorMinutes: number | null;
      friction: string[];
      unlockDrivers: string[];
      conditions: string[];
    };
    playerArchetypesExtraction?: { archetypes: PlayerArchetype[] };
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
