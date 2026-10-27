import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import type { SteamVoice } from 'vaporchat/client/steamVoice';

// VaporLens (vaporlens.app) sums up a game's Steam reviews.
const SITE_URL = 'https://vaporlens.app';
const API_URL = `${SITE_URL}/api/app/`;
const PAGE_URL = `${SITE_URL}/app/`;
// the account's vaporlens.app session, next to the Steam token
const SESSION_KEY = 'vaporlens-session';
const DAY_MS = 24 * 60 * 60 * 1000;

interface VaporlensSession {
  steamid: string;
  token: string;
  /** epoch ms */
  expiresAt: number;
}

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
  /** ISO date of the last analysis */
  lastUpdated?: string;
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
  /** appids of the analyzed games whose reviews read most like this one's, closest first */
  similar?: number[];
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

// read from SecureStore once, every write goes through here
let session: Promise<VaporlensSession | null> | undefined;

function loadSession() {
  session ??= SecureStore.getItemAsync(SESSION_KEY).then((saved) =>
    saved ? (JSON.parse(saved) as VaporlensSession) : null,
  );
  return session;
}

/** Whether the account has a vaporlens.app session, read from SecureStore without a request. */
export async function hasVaporlensSession() {
  return (await loadSession()) !== null;
}

/** Forgets the vaporlens.app session, on signing out of Steam or switching accounts. */
export function clearVaporlensSession() {
  session = Promise.resolve(null);
  return SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * Signs the account in to vaporlens.app with Steam OpenID, unless it still has a session there.
 * vaporlens.app gets only Steam's signed assertion, never a Steam token. Failing leaves it signed out.
 */
export async function signInToVaporlens(voice: SteamVoice) {
  try {
    const { steamid } = voice.me;
    const loaded = loadSession();
    const saved = await loaded;
    if (saved?.steamid === steamid && saved.expiresAt - Date.now() > DAY_MS)
      return;
    const signed = await voice.connection.openIdSignIn(
      SITE_URL,
      `${SITE_URL}/api/auth/app/callback`,
      // follows no redirect: Steam's would carry its cookie to vaporlens.app
      expoFetch,
    );
    // without Steam's cookie
    const response = await fetch(signed);
    if (!response.ok)
      throw new Error(`vaporlens.app answered HTTP ${response.status}`);
    const { token, expiresAt } = (await response.json()) as Omit<
      VaporlensSession,
      'steamid'
    >;
    // signed out or switched accounts meanwhile
    if (session !== loaded) return;
    const signedIn = { steamid, token, expiresAt };
    session = Promise.resolve(signedIn);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(signedIn));
  } catch (err) {
    console.warn('Signing in to VaporLens failed:', err);
  }
}

/** A vaporlens.app request as the signed-in user, null when there's no session. */
async function vaporlensFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  // every sign-out and account switch clears it, a stored one is the open account's
  const stored = await loadSession();
  if (!stored) return null;
  const response = await fetch(`${SITE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${stored.token}` },
  });
  // signed out on the server, the next sign-in makes a new one
  if (response.status === 401) {
    await clearVaporlensSession();
    return null;
  }
  if (!response.ok)
    throw new Error(`VaporLens answered HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** What the server says to an import or analysis request. */
export interface VaporlensAnswer {
  error?: string;
  message?: string;
  /** an import's games stored */
  imported?: number;
  /** library games the taste profile was built from */
  profiled?: number;
}

/** How close a game is to what the user plays. */
export interface GameFit {
  user: { hasTasteProfile?: boolean };
  /** 0 to 100, higher is closer; null when it can't tell */
  fit: number | null;
}

/** How close a game is to what the user plays, null when signed out of vaporlens.app. */
export function getGameFit(appid: number) {
  return vaporlensFetch<GameFit>(`/api/mobile/fit/${appid}`);
}

/** Whether the user asked for the game's analysis, null when signed out of vaporlens.app. */
export function getQueueVote(appid: number) {
  return vaporlensFetch<{ hasUserVote: boolean }>(`/api/mobile/queue/${appid}`);
}

/** An action's answer, its `error` saying why when it couldn't run. */
function answerOf(
  request: Promise<VaporlensAnswer | null>,
): Promise<VaporlensAnswer> {
  return request.then(
    (answer) => answer ?? { error: 'Not signed in to VaporLens' },
    (err: Error) => ({ error: err.message }),
  );
}

/** Adds the game to VaporLens's queue, or votes for it when it's there. */
export function requestAnalysis(appid: number) {
  return answerOf(
    vaporlensFetch(`/api/mobile/queue/${appid}`, { method: 'POST' }),
  );
}

/** Asks VaporLens to analyze an analyzed game again, with its latest reviews. */
export function requestUpdate(appid: number) {
  return answerOf(
    vaporlensFetch(`/api/mobile/queue/${appid}`, { method: 'PUT' }),
  );
}

/** Has vaporlens.app import the user's Steam library or wishlist, which must be public. */
export function importSteamGames(source: 'library' | 'wishlist') {
  return answerOf(
    vaporlensFetch('/api/mobile/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
    }),
  );
}
