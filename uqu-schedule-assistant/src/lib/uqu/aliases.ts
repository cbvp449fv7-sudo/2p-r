/**
 * Faculty alias resolution.
 *
 * The roster has no stable identifiers, carries honorific prefixes, and repeats
 * some display names. Schedule sheets spell the same person several ways. Names
 * are therefore never merged automatically: this module proposes candidates and
 * an administrator confirms each uncertain or duplicate match.
 */

import type { FacultyAlias, SourceRef } from "../types";
import { nameKey, squash } from "./normalize";
import type { ParsedFacultyRow } from "./parse-faculty";

export type AliasCandidate = { facultyId: string; name: string; score: number; reason: string };

/** Token-overlap similarity between two Arabic names, 0 to 1. */
export function similarity(a: string, b: string): number {
  const left = nameKey(a).split(" ").filter(Boolean);
  const right = nameKey(b).split(" ").filter(Boolean);
  if (!left.length || !right.length) return 0;
  const shared = left.filter((t) => right.includes(t));
  return (2 * shared.length) / (left.length + right.length);
}

export function candidatesFor(display: string, roster: ParsedFacultyRow[], threshold = 0.5): AliasCandidate[] {
  const exact = roster.filter((r) => nameKey(r.name) === nameKey(display));
  if (exact.length) {
    return exact.map((r) => ({
      facultyId: r.id,
      name: r.name,
      score: 1,
      reason: exact.length > 1 ? "Exact name match, but the roster holds more than one person with this name." : "Exact name match after honorifics are stripped.",
    }));
  }
  return roster
    .map((r) => ({ facultyId: r.id, name: r.name, score: similarity(display, r.name), reason: "Partial name match." }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Build one alias record per distinct schedule spelling.
 * A single confident, unambiguous exact match resolves; anything else waits for
 * manual confirmation.
 */
export function buildAliases(
  displays: { display: string; ref: SourceRef }[],
  roster: ParsedFacultyRow[],
): FacultyAlias[] {
  const grouped = new Map<string, { display: string; refs: SourceRef[] }>();
  for (const item of displays) {
    const key = squash(item.display);
    if (!key) continue;
    const bucket = grouped.get(key) ?? { display: key, refs: [] };
    bucket.refs.push(item.ref);
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((entry) => {
    const candidates = candidatesFor(entry.display, roster);
    const perfect = candidates.filter((c) => c.score === 1);
    const status: FacultyAlias["status"] = perfect.length === 1 ? "resolved" : perfect.length > 1 ? "ambiguous" : candidates.length ? "unresolved" : "unresolved";
    return {
      id: `ALIAS-${entry.display}`,
      display: entry.display,
      facultyId: status === "resolved" ? perfect[0].facultyId : null,
      status,
      candidates: candidates.map((c) => c.facultyId),
      sourceRefs: entry.refs,
    };
  });
}

/** Aliases that still need a decision before an import may be committed. */
export function unresolvedAliases(aliases: FacultyAlias[]): FacultyAlias[] {
  return aliases.filter((a) => a.status !== "resolved" || !a.facultyId);
}
