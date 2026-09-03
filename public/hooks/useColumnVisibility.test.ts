/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useColumnVisibility, ColumnDef } from './useColumnVisibility';

const STORAGE_KEY = 'test_visible_columns';
const KNOWN_KEY = `${STORAGE_KEY}:known`;

// Seed the new dual-key storage: visible IDs under the primary key (legacy string[] shape),
// known IDs under the sibling ":known" key.
const seedStorage = (visible: string[], known: string[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
  localStorage.setItem(KNOWN_KEY, JSON.stringify(known));
};

const baseColumns: ColumnDef[] = [
  { id: 'id', label: 'ID', pinned: true },
  { id: 'type', label: 'Type' },
  { id: 'timestamp', label: 'Timestamp' },
  { id: 'latency', label: 'Latency' },
  { id: 'cpu', label: 'CPU Time' },
];

describe('useColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('default state', () => {
    it('all columns are visible when no localStorage value exists', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      expect(result.current.visibleColumnIds.size).toBe(baseColumns.length);
      baseColumns.forEach((col) => {
        expect(result.current.isColumnVisible(col.id)).toBe(true);
      });
    });
  });

  describe('toggle on/off', () => {
    it('toggling a column hides it', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.toggleColumn('type');
      });

      expect(result.current.isColumnVisible('type')).toBe(false);
    });

    it('toggling a hidden column shows it again', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.toggleColumn('type');
      });
      expect(result.current.isColumnVisible('type')).toBe(false);

      act(() => {
        result.current.toggleColumn('type');
      });
      expect(result.current.isColumnVisible('type')).toBe(true);
    });
  });

  describe('pinned columns', () => {
    it('attempting to toggle a pinned column is a no-op', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.toggleColumn('id');
      });

      expect(result.current.isColumnVisible('id')).toBe(true);
    });
  });

  describe('last-non-pinned-column guard', () => {
    it('cannot hide the last visible non-pinned column', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      // Hide all non-pinned columns except one
      act(() => {
        result.current.toggleColumn('type');
      });
      act(() => {
        result.current.toggleColumn('timestamp');
      });
      act(() => {
        result.current.toggleColumn('latency');
      });
      // Now only 'cpu' is the last non-pinned visible column
      expect(result.current.isColumnVisible('cpu')).toBe(true);

      // Trying to hide the last one should be a no-op
      act(() => {
        result.current.toggleColumn('cpu');
      });
      expect(result.current.isColumnVisible('cpu')).toBe(true);
    });
  });

  describe('showAll', () => {
    it('makes all columns visible', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      // Hide some columns first
      act(() => {
        result.current.toggleColumn('type');
      });
      act(() => {
        result.current.toggleColumn('latency');
      });

      act(() => {
        result.current.showAll();
      });

      baseColumns.forEach((col) => {
        expect(result.current.isColumnVisible(col.id)).toBe(true);
      });
    });
  });

  describe('hideAll', () => {
    it('hides all non-pinned columns (pinned remain visible)', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.hideAll();
      });

      // Pinned column remains visible
      expect(result.current.isColumnVisible('id')).toBe(true);
      // Non-pinned columns are hidden
      expect(result.current.isColumnVisible('type')).toBe(false);
      expect(result.current.isColumnVisible('timestamp')).toBe(false);
      expect(result.current.isColumnVisible('latency')).toBe(false);
      expect(result.current.isColumnVisible('cpu')).toBe(false);
    });

    it('keeps at least one column visible when there are no pinned columns', () => {
      const noPinnedColumns: ColumnDef[] = [
        { id: 'type', label: 'Type' },
        { id: 'timestamp', label: 'Timestamp' },
      ];

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: noPinnedColumns })
      );

      act(() => {
        result.current.hideAll();
      });

      // At least one column should remain visible
      const visibleCount = noPinnedColumns.filter((col) =>
        result.current.isColumnVisible(col.id)
      ).length;
      expect(visibleCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('localStorage persistence', () => {
    it('persists state to localStorage on toggle', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.toggleColumn('type');
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(Array.isArray(stored)).toBe(true);
      expect(stored).not.toContain('type');
    });

    it('persists state to localStorage on showAll', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.toggleColumn('type');
      });
      act(() => {
        result.current.showAll();
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toContain('type');
      expect(stored).toContain('timestamp');
      expect(stored).toContain('latency');
      expect(stored).toContain('cpu');
    });

    it('persists state to localStorage on hideAll', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      act(() => {
        result.current.hideAll();
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      // Non-pinned columns should not be in the stored visible set (they're hidden)
      expect(stored).not.toContain('type');
      expect(stored).not.toContain('timestamp');
    });

    it('restores state from localStorage on mount', () => {
      // Pre-seed localStorage with only some columns visible
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['type', 'latency']));

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      // Pinned column always visible
      expect(result.current.isColumnVisible('id')).toBe(true);
      // Stored visible columns
      expect(result.current.isColumnVisible('type')).toBe(true);
      expect(result.current.isColumnVisible('latency')).toBe(true);
      // Not stored, so hidden
      expect(result.current.isColumnVisible('timestamp')).toBe(false);
      expect(result.current.isColumnVisible('cpu')).toBe(false);
    });

    it('shows a newly-added column for a returning user while keeping deliberately-hidden ones hidden', () => {
      // New-format storage: the user has seen type/timestamp/latency/cpu and deliberately
      // hid 'timestamp'. A column not in "known" (e.g. one added in an upgrade) is new.
      seedStorage(['type', 'latency', 'cpu'], ['type', 'timestamp', 'latency', 'cpu']);

      const columnsWithNew = [...baseColumns, { id: 'opaque_id', label: 'X-Opaque-Id' }];

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: columnsWithNew })
      );

      // Deliberately-hidden column (in known, not in visible) stays hidden.
      expect(result.current.isColumnVisible('timestamp')).toBe(false);
      // Previously-visible columns remain visible.
      expect(result.current.isColumnVisible('type')).toBe(true);
      expect(result.current.isColumnVisible('latency')).toBe(true);
      // New column (not in known) is shown by default.
      expect(result.current.isColumnVisible('opaque_id')).toBe(true);
    });

    it('respects defaultVisible:false for a newly-added column', () => {
      seedStorage(['type'], ['type', 'timestamp', 'latency', 'cpu']);

      const columnsWithHiddenNew = [
        ...baseColumns,
        { id: 'debug_col', label: 'Debug', defaultVisible: false },
      ];

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: columnsWithHiddenNew })
      );

      // New but defaultVisible:false -> not auto-shown.
      expect(result.current.isColumnVisible('debug_col')).toBe(false);
    });

    it('migrates a legacy value on first write without resurrecting deliberately-hidden columns', () => {
      // Legacy format (bare array of visible IDs): the user had hidden 'timestamp' and 'cpu'.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['type', 'latency']));

      const first = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      // Legacy semantics on load: unlisted columns are hidden.
      expect(first.result.current.isColumnVisible('timestamp')).toBe(false);
      expect(first.result.current.isColumnVisible('cpu')).toBe(false);

      // A user action triggers the first write, which persists visible (primary key) + known
      // (sibling key).
      act(() => {
        first.result.current.toggleColumn('type'); // hide 'type'
      });

      const storedVisible = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      const storedKnown = JSON.parse(localStorage.getItem(KNOWN_KEY)!);
      // Primary key stays a bare string[] (readable by older builds); known recorded separately.
      expect(Array.isArray(storedVisible)).toBe(true);
      expect(storedKnown).toEqual(expect.arrayContaining(['type', 'timestamp', 'latency', 'cpu']));
      // The previously-hidden columns are known but not visible.
      expect(storedVisible).not.toContain('timestamp');
      expect(storedVisible).not.toContain('cpu');

      first.unmount();

      // Remount: the migrated columns must NOT be resurrected as "new".
      const second = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );
      expect(second.result.current.isColumnVisible('timestamp')).toBe(false);
      expect(second.result.current.isColumnVisible('cpu')).toBe(false);
      expect(second.result.current.isColumnVisible('type')).toBe(false); // still hidden by the toggle
    });

    it('reveals a newColumnIds column on legacy storage but keeps other absent columns hidden', () => {
      // Legacy value written by a prior release that had type/timestamp/latency/cpu but NOT
      // opaque_id. The user had hidden 'timestamp' (absent from the array).
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['type', 'latency', 'cpu']));

      const columnsWithNew = [...baseColumns, { id: 'opaque_id', label: 'X-Opaque-Id' }];

      const { result } = renderHook(() =>
        useColumnVisibility({
          storageKey: STORAGE_KEY,
          columns: columnsWithNew,
          newColumnIds: ['opaque_id'],
        })
      );

      // The release-new column is shown even though legacy storage never listed it.
      expect(result.current.isColumnVisible('opaque_id')).toBe(true);
      // A column absent from the legacy array that is NOT flagged as new stays hidden
      // (historical "absent === hidden" semantics preserved).
      expect(result.current.isColumnVisible('timestamp')).toBe(false);
      // Previously-visible columns remain visible.
      expect(result.current.isColumnVisible('type')).toBe(true);
      expect(result.current.isColumnVisible('latency')).toBe(true);
    });

    it('keeps the primary storage key as a bare string[] for backward compatibility', () => {
      // Older plugin builds only understand a bare string[] under the primary key. After the new
      // hook writes, the primary key must still parse as that shape so a downgrade preserves the
      // user's visible-column choices instead of resetting to all-visible.
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );
      act(() => {
        result.current.toggleColumn('type'); // hide a column so visible != all
      });

      const primary = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(Array.isArray(primary)).toBe(true);
      expect(primary.every((id: unknown) => typeof id === 'string')).toBe(true);
      expect(primary).not.toContain('type');
      // The known set lives under a separate sibling key, invisible to the old hook.
      expect(localStorage.getItem(KNOWN_KEY)).not.toBeNull();
    });

    it('treats a value with the primary key but no sibling known key as legacy', () => {
      // Simulates storage written by an older build (primary key only): unlisted columns stay
      // hidden (historical behavior), not revealed as new.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['type', 'latency']));
      // No KNOWN_KEY set.

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      expect(result.current.isColumnVisible('type')).toBe(true);
      expect(result.current.isColumnVisible('latency')).toBe(true);
      expect(result.current.isColumnVisible('timestamp')).toBe(false);
      expect(result.current.isColumnVisible('cpu')).toBe(false);
    });

    it('does not resurrect a hidden newColumnIds column after it has been persisted as known', () => {
      // New-format storage where opaque_id is already known and was deliberately hidden.
      seedStorage(['type', 'latency'], ['type', 'timestamp', 'latency', 'cpu', 'opaque_id']);

      const columnsWithNew = [...baseColumns, { id: 'opaque_id', label: 'X-Opaque-Id' }];

      const { result } = renderHook(() =>
        useColumnVisibility({
          storageKey: STORAGE_KEY,
          columns: columnsWithNew,
          newColumnIds: ['opaque_id'],
        })
      );

      // opaque_id is known-but-not-visible -> deliberately hidden -> stays hidden despite being
      // listed in newColumnIds.
      expect(result.current.isColumnVisible('opaque_id')).toBe(false);
    });
  });

  describe('corrupted localStorage handling', () => {
    it('falls back to all-visible defaults when stored JSON is invalid', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      baseColumns.forEach((col) => {
        expect(result.current.isColumnVisible(col.id)).toBe(true);
      });
    });

    it('falls back to all-visible defaults when stored value is not an array of strings', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      baseColumns.forEach((col) => {
        expect(result.current.isColumnVisible(col.id)).toBe(true);
      });
    });

    it('falls back to all-visible defaults when stored array contains non-strings', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      baseColumns.forEach((col) => {
        expect(result.current.isColumnVisible(col.id)).toBe(true);
      });
    });
  });

  describe('dynamic columns change', () => {
    it('new columns that appear default to visible', () => {
      const initialColumns: ColumnDef[] = [
        { id: 'id', label: 'ID', pinned: true },
        { id: 'type', label: 'Type' },
      ];

      const expandedColumns: ColumnDef[] = [
        { id: 'id', label: 'ID', pinned: true },
        { id: 'type', label: 'Type' },
        { id: 'wlm_group', label: 'WLM Group' },
      ];

      const { result, rerender } = renderHook((props) => useColumnVisibility(props), {
        initialProps: { storageKey: STORAGE_KEY, columns: initialColumns },
      });

      expect(result.current.isColumnVisible('id')).toBe(true);
      expect(result.current.isColumnVisible('type')).toBe(true);

      // Simulate columns changing (e.g., data source update)
      rerender({ storageKey: STORAGE_KEY, columns: expandedColumns });

      expect(result.current.isColumnVisible('wlm_group')).toBe(true);
    });

    it('columns that disappear are removed from the visible set', () => {
      const initialColumns: ColumnDef[] = [
        { id: 'id', label: 'ID', pinned: true },
        { id: 'type', label: 'Type' },
        { id: 'wlm_group', label: 'WLM Group' },
      ];

      const reducedColumns: ColumnDef[] = [
        { id: 'id', label: 'ID', pinned: true },
        { id: 'type', label: 'Type' },
      ];

      const { result, rerender } = renderHook((props) => useColumnVisibility(props), {
        initialProps: { storageKey: STORAGE_KEY, columns: initialColumns },
      });

      expect(result.current.isColumnVisible('wlm_group')).toBe(true);

      // Simulate columns changing (feature flag turned off)
      rerender({ storageKey: STORAGE_KEY, columns: reducedColumns });

      expect(result.current.visibleColumnIds.has('wlm_group')).toBe(false);
    });
  });

  describe('columns pass-through', () => {
    it('returns the columns array from options', () => {
      const { result } = renderHook(() =>
        useColumnVisibility({ storageKey: STORAGE_KEY, columns: baseColumns })
      );

      expect(result.current.columns).toBe(baseColumns);
    });
  });
});
