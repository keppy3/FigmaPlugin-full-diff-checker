// Pairs up Before/After scan targets so rows survive structural drift
// between the two sides (pages/frames added or removed). See spec.md
// section 9 for the reasoning behind the match key choice.
import type { ScanTarget } from '../shared/messages';

export interface MatchedPair {
  before: ScanTarget | null;
  after: ScanTarget | null;
}

/**
 * `component.key` survives renames and branch republish, so it's used as the
 * match key wherever available (see figmaApi.ts#toSummary); everything else
 * falls back to "page / path / name", which breaks if a Section or Frame is
 * renamed between Before and After -- that surfaces as a REMOVED + ADDED
 * pair rather than a single diff row. Acceptable v1 limitation (spec.md §12).
 *
 * Order: matched pairs follow Before's order, Before-only ("removed") stay
 * in that same relative position, After-only ("added") are appended last.
 */
export function matchTargets(before: ScanTarget[], after: ScanTarget[]): MatchedPair[] {
  const afterByKey = new Map(after.map((target) => [target.matchKey, target]));
  const consumedAfterKeys = new Set<string>();
  const pairs: MatchedPair[] = [];

  for (const b of before) {
    const a = afterByKey.get(b.matchKey);
    if (a) {
      consumedAfterKeys.add(b.matchKey);
      pairs.push({ before: b, after: a });
    } else {
      pairs.push({ before: b, after: null });
    }
  }

  for (const a of after) {
    if (!consumedAfterKeys.has(a.matchKey)) {
      pairs.push({ before: null, after: a });
    }
  }

  return pairs;
}
