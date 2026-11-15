/**
 * Permanent "routeur" lists.
 *
 * These six lists always exist in ColisFlow (as non-deletable distributors).
 * Return Scanner Pro shows them too, so both apps must agree on which lists
 * are routeurs — but the operator's own spelling wins: matching tolerates an
 * extra "e" in ROUTEUR(E), doubled spaces and accents, so a list renamed in
 * Colis Scanner still lands on the right slot instead of creating a duplicate.
 */
export interface FixedList {
  id: string
  name: string
}

export const FIXED_LISTS: FixedList[] = [
  { id: 'fixed-routeure-ayoub', name: 'ROUTEURE AYOUB' },
  { id: 'fixed-routeur-anass', name: 'ROUTEUR ANASS' },
  { id: 'fixed-routeure-lazrak', name: 'ROUTEURE LAZRAK' },
  { id: 'fixed-routeure-bourbiaa', name: 'ROUTEURE BOURBIAA' },
  { id: 'fixed-routeure-yassin', name: 'ROUTEURE YASSIN' },
  { id: 'fixed-routeure', name: 'ROUTEURE' },
]

/** Folds a list name into a comparable key (accents, spaces, ROUTEUR(E)). */
export function normalizeFixedName(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^routeure\b/, 'routeur')
}

const NORMALIZED = new Set(FIXED_LISTS.map((list) => normalizeFixedName(list.name)))

/** True when a name is one of the permanent routeur lists (tolerant). */
export function isFixedListName(name: string): boolean {
  return NORMALIZED.has(normalizeFixedName(name))
}
