/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

export interface ColumnDef {
  id: string;
  label: string;
  pinned?: boolean;
  defaultVisible?: boolean;
}

export interface UseColumnVisibilityOptions {
  storageKey: string;
  columns: ColumnDef[];
  // Column IDs introduced in the current release. Because the hook only persists visible IDs,
  // it cannot otherwise tell a column an earlier version's user deliberately hid from one that
  // simply did not exist yet. Listing new IDs here means: when reading legacy storage (written
  // before these existed), treat them as "not previously known" so they appear by default
  // instead of being locked hidden. A column that did not exist in the prior release could not
  // have been hidden by that release's user.
  newColumnIds?: string[];
}

export interface UseColumnVisibilityResult {
  visibleColumnIds: Set<string>;
  isColumnVisible: (id: string) => boolean;
  toggleColumn: (id: string) => void;
  showAll: () => void;
  hideAll: () => void;
  columns: ColumnDef[];
}

/**
 * Persisted shape.
 *  - `visible`: non-pinned column IDs the user currently has shown.
 *  - `known`: every non-pinned column ID that existed the last time state was persisted.
 *
 * Tracking `known` lets us distinguish a column the user deliberately hid (in `known`,
 * not in `visible`) from a column added since they last used the page (in neither) — the
 * latter should appear by default, the former should stay hidden. The legacy format was a
 * bare string[] of visible IDs; it is read back with known === visible so existing
 * preferences (including deliberate hides of columns present at that time) are preserved.
 */
interface StoredColumnState {
  visible: string[];
  known: string[];
  // True when loaded from the legacy bare-array format, where the full set of columns that
  // existed at save time is unknown. In that case we cannot tell a deliberately-hidden column
  // from a not-yet-existing one, so we preserve the historical behavior (absent === hidden).
  legacy?: boolean;
}

/**
 * The "known" column set is persisted under a sibling key so the primary key keeps the legacy
 * bare string[] shape. That preserves backward compatibility: an older plugin build (whose hook
 * only understands string[]) still reads the primary key and keeps the user's visible-column
 * choices on a downgrade, instead of failing to parse and resetting everything to all-visible.
 */
function knownStorageKey(storageKey: string): string {
  return `${storageKey}:known`;
}

/**
 * Reads a JSON string[] from localStorage. Returns null if unavailable, corrupted, or not an
 * array of strings.
 */
function readStringArray(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Reads stored column state. The primary key holds visible IDs as a bare string[] (readable by
 * older builds); the sibling key holds the "known" set. When the sibling key is absent — a value
 * written by an older build, or the very first load after upgrade — we cannot distinguish a
 * deliberately-hidden column from a not-yet-existing one, so `legacy` is set to preserve the
 * historical "absent === hidden" behavior. Returns null when nothing is stored.
 */
function readFromStorage(storageKey: string): StoredColumnState | null {
  const visible = readStringArray(storageKey);
  if (visible === null) return null;
  const known = readStringArray(knownStorageKey(storageKey));
  if (known === null) {
    return { visible, known: visible, legacy: true };
  }
  return { visible, known };
}

/**
 * Persists visible IDs (primary key, legacy string[] shape) and the known set (sibling key).
 * Silently ignores errors (e.g., quota exceeded, private browsing).
 */
function writeToStorage(storageKey: string, visibleIds: string[], knownIds: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(visibleIds));
    localStorage.setItem(knownStorageKey(storageKey), JSON.stringify(knownIds));
  } catch {
    // Fall back to in-memory only — no action needed
  }
}

/**
 * Non-pinned column IDs — the set persisted as "known".
 */
function getNonPinnedIds(columns: ColumnDef[]): string[] {
  return columns.filter((col) => !col.pinned).map((col) => col.id);
}

/**
 * Computes the default visible set: columns with defaultVisible !== false.
 */
function getAllColumnIds(columns: ColumnDef[]): Set<string> {
  return new Set(columns.filter((col) => col.defaultVisible !== false).map((col) => col.id));
}

/**
 * A reusable hook for managing column visibility state with localStorage persistence.
 *
 * - Reads initial state from localStorage; defaults to all columns visible.
 * - Pinned columns are always included in visibleColumnIds.
 * - Guards against hiding all non-pinned columns (toggle is a no-op for the last one).
 * - Reconciles state when the columns array changes (removes stale, adds new as visible).
 * - Handles localStorage errors and corrupted JSON gracefully.
 */
export function useColumnVisibility(
  options: UseColumnVisibilityOptions
): UseColumnVisibilityResult {
  const { storageKey, columns, newColumnIds } = options;

  // Track columns array identity for reconciliation
  const prevColumnsRef = useRef<ColumnDef[]>(columns);

  // The set of column IDs known to the user the last time state was persisted. Seeded from
  // storage on mount and kept current on every write, so both the reconcile memo and the
  // write path can distinguish genuinely-new columns from deliberately-hidden ones without
  // relying on cross-render column-array identity alone.
  const knownColumnIdsRef = useRef<Set<string>>(new Set());

  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => {
    const stored = readFromStorage(storageKey);
    if (stored === null) {
      // First-ever visit: everything defaultVisible is on, and every current column is "known".
      knownColumnIdsRef.current = new Set(getNonPinnedIds(columns));
      return getAllColumnIds(columns);
    }

    const currentIds = new Set(columns.map((col) => col.id));
    const pinnedIds = new Set(columns.filter((col) => col.pinned).map((col) => col.id));
    const releaseNewIds = new Set(newColumnIds ?? []);
    const previouslyKnown = new Set(stored.known);

    // Start from the stored visible preferences (restricted to columns that still exist).
    const visible = new Set<string>(stored.visible.filter((id) => currentIds.has(id)));

    // Decide which columns to show by default (were not previously visible).
    //  - New-format storage: "known" is reliable, so any column not in it is genuinely new to
    //    the user — reveal it (respecting defaultVisible). Columns in "known" but not "visible"
    //    were deliberately hidden and stay hidden.
    //  - Legacy storage: "known" equals the old visible set, so a hidden column and a
    //    not-yet-existing one are indistinguishable. Preserve the historical "absent === hidden"
    //    behavior, revealing ONLY columns the caller flagged as new in this release (those could
    //    not have been hidden by the earlier version's user).
    for (const col of columns) {
      if (col.defaultVisible === false || previouslyKnown.has(col.id)) {
        continue;
      }
      const isRevealable = stored.legacy ? releaseNewIds.has(col.id) : true;
      if (isRevealable) {
        visible.add(col.id);
      }
    }

    // Always include pinned columns
    for (const id of pinnedIds) {
      visible.add(id);
    }

    // Record what is now known. For legacy storage the release-new ids were not truly "known"
    // to the prior user, but they exist now; recording every current column here (plus the
    // prior known set) means the reveal above won't run again on the next load.
    knownColumnIdsRef.current = new Set([...previouslyKnown, ...getNonPinnedIds(columns)]);

    return visible;
  });

  // Reconcile when columns array changes
  const reconciledVisibleIds = useMemo(() => {
    const currentIds = new Set(columns.map((col) => col.id));
    const pinnedIds = new Set(columns.filter((col) => col.pinned).map((col) => col.id));
    const prevIds = new Set(prevColumnsRef.current.map((col) => col.id));

    // Find columns that appeared this render (not in the previous columns array)
    const appearedColumnIds = [...currentIds].filter((id) => !prevIds.has(id));
    // Find stale columns (in visible set but not in current columns)
    const staleIds = [...visibleColumnIds].filter((id) => !currentIds.has(id));

    if (appearedColumnIds.length === 0 && staleIds.length === 0) {
      // Ensure pinned are always included
      let needsUpdate = false;
      for (const id of pinnedIds) {
        if (!visibleColumnIds.has(id)) {
          needsUpdate = true;
          break;
        }
      }
      if (!needsUpdate) return visibleColumnIds;
    }

    // Build reconciled set
    const reconciled = new Set<string>();
    for (const id of visibleColumnIds) {
      if (currentIds.has(id)) {
        reconciled.add(id);
      }
    }
    // Add columns that appeared this render as visible by default (respecting defaultVisible),
    // but ONLY when they are also genuinely new to the user (not in the persisted "known"
    // set). A version-gated column that flips on during render 2 is "new" relative to the
    // previous render yet may have been deliberately hidden earlier — checking "known" keeps
    // that hidden preference from being resurrected.
    for (const id of appearedColumnIds) {
      if (knownColumnIdsRef.current.has(id)) {
        continue;
      }
      const col = columns.find((c) => c.id === id);
      if (col && col.defaultVisible !== false) {
        reconciled.add(id);
      }
    }
    // Ensure pinned columns are always included
    for (const id of pinnedIds) {
      reconciled.add(id);
    }

    return reconciled;
  }, [columns, visibleColumnIds]);

  // Persist the given visible set, unioning "known" with what was already stored plus the
  // current columns. Unioning (rather than narrowing to the columns rendered right now) keeps
  // the known-membership — and therefore the hidden/new distinction — for columns that are
  // temporarily absent behind an off version gate. Also keeps knownColumnIdsRef in sync.
  const persist = useCallback(
    (visibleSet: Set<string>) => {
      const idsToStore = [...visibleSet].filter((id) => {
        const col = columns.find((c) => c.id === id);
        return col && !col.pinned;
      });
      const known = new Set<string>([...knownColumnIdsRef.current, ...getNonPinnedIds(columns)]);
      knownColumnIdsRef.current = known;
      writeToStorage(storageKey, idsToStore, [...known]);
    },
    [columns, storageKey]
  );

  // Sync reconciled state back if it differs (via useEffect to avoid setting state during render)
  useEffect(() => {
    if (reconciledVisibleIds !== visibleColumnIds) {
      setVisibleColumnIds(reconciledVisibleIds);
      persist(reconciledVisibleIds);
    }
  }, [reconciledVisibleIds, visibleColumnIds, persist]);

  // Update prevColumnsRef
  useEffect(() => {
    prevColumnsRef.current = columns;
  }, [columns]);

  const isColumnVisible = useCallback(
    (id: string): boolean => {
      return reconciledVisibleIds.has(id);
    },
    [reconciledVisibleIds]
  );

  const toggleColumn = useCallback(
    (id: string) => {
      const col = columns.find((c) => c.id === id);
      // No-op for pinned columns
      if (col?.pinned) return;

      setVisibleColumnIds((prev) => {
        const isCurrentlyVisible = prev.has(id);

        if (isCurrentlyVisible) {
          // Guard: don't hide if it's the last visible non-pinned column
          const pinnedIds = new Set(columns.filter((c) => c.pinned).map((c) => c.id));
          const currentColumnIds = new Set(columns.map((c) => c.id));
          const nonPinnedVisible = [...prev].filter(
            (visId) => !pinnedIds.has(visId) && currentColumnIds.has(visId)
          );
          if (nonPinnedVisible.length <= 1) {
            return prev; // no-op
          }
        }

        const next = new Set(prev);
        if (isCurrentlyVisible) {
          next.delete(id);
        } else {
          next.add(id);
        }

        persist(next);

        return next;
      });
    },
    [columns, persist]
  );

  const showAll = useCallback(() => {
    const allIds = new Set(columns.map((col) => col.id));
    setVisibleColumnIds(allIds);
    persist(allIds);
  }, [columns, persist]);

  const hideAll = useCallback(() => {
    // Keep only pinned columns visible
    const pinnedIds = new Set(columns.filter((col) => col.pinned).map((col) => col.id));

    // Guard: if there are no pinned columns, keep at least the first non-pinned column
    if (pinnedIds.size === 0 && columns.length > 0) {
      pinnedIds.add(columns[0].id);
    }

    setVisibleColumnIds(pinnedIds);
    persist(pinnedIds);
  }, [columns, persist]);

  return {
    visibleColumnIds: reconciledVisibleIds,
    isColumnVisible,
    toggleColumn,
    showAll,
    hideAll,
    columns,
  };
}
