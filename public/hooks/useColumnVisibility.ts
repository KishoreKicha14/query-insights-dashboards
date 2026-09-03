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
  // Column IDs new in this release. When reading legacy storage (written before they existed),
  // treat them as new rather than deliberately hidden, so they default to visible.
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
 * Persisted shape:
 *  - `visible`: non-pinned column IDs currently shown.
 *  - `known`: non-pinned column IDs that existed at the last persist.
 *
 * `known` separates a deliberately-hidden column (known, not visible) from one added since the
 * last visit (in neither) — the latter defaults to visible. Legacy storage was a bare string[]
 * of visible IDs, read back as known === visible.
 */
interface StoredColumnState {
  visible: string[];
  known: string[];
  // Loaded from the legacy bare-array format, where the set of columns at save time is unknown,
  // so we can't tell a hidden column from a new one and fall back to absent === hidden.
  legacy?: boolean;
}

/**
 * `known` lives under a sibling key so the primary key keeps the legacy bare string[] shape —
 * an older build still parses it and keeps the user's choices on a downgrade.
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

  // Columns known at the last persist. Seeded on mount, updated on every write; lets us tell
  // new columns from deliberately-hidden ones.
  const knownColumnIdsRef = useRef<Set<string>>(new Set());

  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => {
    const stored = readFromStorage(storageKey);
    if (stored === null) {
      // First-ever visit: everything defaultVisible is on, and every current column is "known".
      knownColumnIdsRef.current = new Set(getNonPinnedIds(columns));
      return getAllColumnIds(columns);
    }

    const pinnedIds = new Set(columns.filter((col) => col.pinned).map((col) => col.id));
    const releaseNewIds = new Set(newColumnIds ?? []);
    const previouslyKnown = new Set(stored.known);

    // Keep the full stored preference — don't filter to this render's columns. Version-gated
    // columns are absent until the version probe resolves; dropping them here would lose the
    // preference and the "known" guard below would stop them re-appearing. Rendering intersects
    // with the current columns separately (see reconcile).
    const visible = new Set<string>(stored.visible);

    // Reveal columns not previously visible:
    //  - New format: "known" is reliable, so anything not in it is new — reveal it (unless
    //    defaultVisible === false). In "known" but not "visible" means hidden on purpose.
    //  - Legacy format: "known" === old visible, so hidden vs new is ambiguous; only reveal ids
    //    the caller flagged as new this release.
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

    // Record what's now known (prior known + current columns) so the reveal above runs once.
    knownColumnIdsRef.current = new Set([...previouslyKnown, ...getNonPinnedIds(columns)]);

    return visible;
  });

  // Reconcile the preference set when columns change. It may hold ids for columns behind an off
  // gate, so it's not filtered to this render's columns (rendering uses renderedVisibleIds). We
  // only add new columns, never drop an id just because its column is currently absent.
  const reconciledVisibleIds = useMemo(() => {
    const currentIds = new Set(columns.map((col) => col.id));
    const pinnedIds = new Set(columns.filter((col) => col.pinned).map((col) => col.id));
    const prevIds = new Set(prevColumnsRef.current.map((col) => col.id));

    // Columns that appeared this render (not in the previous columns array).
    const appearedColumnIds = [...currentIds].filter((id) => !prevIds.has(id));

    // New to the user: appeared this render AND not previously known. A gated column flipping on
    // is already in "known", so it isn't force-shown here — its stored visibility governs it.
    const genuinelyNew = appearedColumnIds.filter((id) => {
      if (knownColumnIdsRef.current.has(id)) return false;
      const col = columns.find((c) => c.id === id);
      return !!col && col.defaultVisible !== false;
    });

    // Does anything change? A new column to add, or a missing pinned column. Absent gated
    // columns are retained, not pruned, so their absence isn't a change.
    let pinnedMissing = false;
    for (const id of pinnedIds) {
      if (!visibleColumnIds.has(id)) {
        pinnedMissing = true;
        break;
      }
    }
    if (genuinelyNew.length === 0 && !pinnedMissing) {
      return visibleColumnIds;
    }

    // Keep everything already there; add new columns and any missing pinned ones.
    const reconciled = new Set<string>(visibleColumnIds);
    for (const id of genuinelyNew) {
      reconciled.add(id);
    }
    for (const id of pinnedIds) {
      reconciled.add(id);
    }

    return reconciled;
  }, [columns, visibleColumnIds]);

  // What's actually rendered: the preference set intersected with this render's columns, so a
  // gated-off column's preference is retained but not shown until its column exists.
  const renderedVisibleIds = useMemo(() => {
    const currentIds = new Set(columns.map((col) => col.id));
    const rendered = new Set<string>();
    for (const id of reconciledVisibleIds) {
      if (currentIds.has(id)) rendered.add(id);
    }
    return rendered;
  }, [columns, reconciledVisibleIds]);

  // Persist the preference set. "visible" and "known" both retain ids for gated-off columns; we
  // only drop currently-pinned ids from "visible" (pinned is always shown, never stored).
  const persist = useCallback(
    (visibleSet: Set<string>) => {
      const currentPinnedIds = new Set(columns.filter((c) => c.pinned).map((c) => c.id));
      const idsToStore = [...visibleSet].filter((id) => !currentPinnedIds.has(id));
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
      return renderedVisibleIds.has(id);
    },
    [renderedVisibleIds]
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
    // Expose the rendered set (preference intersected with present columns) so consumers only
    // see columns that actually exist this render.
    visibleColumnIds: renderedVisibleIds,
    isColumnVisible,
    toggleColumn,
    showAll,
    hideAll,
    columns,
  };
}
