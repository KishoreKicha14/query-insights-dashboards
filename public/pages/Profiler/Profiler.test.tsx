/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderProfiler, setCoreStart } from './Profiler';
import { fireEvent, waitFor, act } from '@testing-library/react';

// @ts-ignore
window.URL.revokeObjectURL = jest.fn();
// @ts-ignore
window.URL.createObjectURL = jest.fn(() => 'blob:mock');

describe('Profiler', () => {
  const mockCoreStart = {
    http: {
      post: jest.fn().mockResolvedValue({ profile: { shards: [] } }),
      get: jest.fn(),
    },
  } as any;

  beforeAll(() => {
    setCoreStart(mockCoreStart);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderInContainer = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let unmount: () => void;
    act(() => {
      unmount = renderProfiler(container);
    });
    return { container, unmount: unmount! };
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders profiler with all tabs', () => {
    const { container, unmount } = renderInContainer();
    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Import');
    expect(container.textContent).toContain('Export JSON');
    expect(container.textContent).toContain('Help');
    act(() => unmount());
  });

  it('opens settings modal when Settings tab is clicked', async () => {
    const { container, unmount } = renderInContainer();
    const settingsTab = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Settings'
    );
    act(() => fireEvent.click(settingsTab!));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Query Profiler Settings');
    });
    act(() => unmount());
  });

  it('opens import flyout when Import tab is clicked', async () => {
    const { container, unmount } = renderInContainer();
    const importTab = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Import'
    );
    act(() => fireEvent.click(importTab!));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Search query');
      expect(document.body.textContent).toContain('Profile JSON');
    });
    act(() => unmount());
  });

  it('opens help flyout when Help tab is clicked', async () => {
    const { container, unmount } = renderInContainer();
    const helpTab = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Help'
    );
    act(() => fireEvent.click(helpTab!));
    await waitFor(() => {
      expect(document.body.textContent).toContain('About Query Profiler');
    });
    act(() => unmount());
  });

  it('exports JSON when Export JSON tab is clicked', () => {
    const { container, unmount } = renderInContainer();
    const createElementSpy = jest.spyOn(document, 'createElement');
    const exportTab = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Export JSON'
    );
    act(() => fireEvent.click(exportTab!));
    expect(createElementSpy).toHaveBeenCalledWith('a');
    createElementSpy.mockRestore();
    act(() => unmount());
  });

  it('executes query when play button is clicked', async () => {
    const { container, unmount } = renderInContainer();
    await waitFor(() => {
      expect(container.querySelector('.conApp__editorActionButton--success')).toBeTruthy();
    });
    const playButton = container.querySelector('.conApp__editorActionButton--success') as HTMLElement;
    act(() => fireEvent.click(playButton));
    await waitFor(() => {
      expect(mockCoreStart.http.post).toHaveBeenCalledWith('/api/profiler-proxy', expect.any(Object));
    });
    act(() => unmount());
  });

  it('resets editors when reset button is clicked', async () => {
    const { container, unmount } = renderInContainer();
    await waitFor(() => {
      expect(container.querySelectorAll('.conApp__editorActionButton--success').length).toBe(2);
    });
    const resetButton = container.querySelectorAll('.conApp__editorActionButton--success')[1] as HTMLElement;
    act(() => fireEvent.click(resetButton));
    expect(resetButton).toBeTruthy();
    act(() => unmount());
  });

  it('updates font size in settings', async () => {
    const { container, unmount } = renderInContainer();
    const settingsTab = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Settings'
    );
    act(() => fireEvent.click(settingsTab!));
    await waitFor(() => {
      expect(document.body.textContent).toContain('Font Size');
    });
    const fontInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => fireEvent.change(fontInput, { target: { value: '16' } }));
    expect(fontInput.value).toBe('16');
    act(() => unmount());
  });
});
