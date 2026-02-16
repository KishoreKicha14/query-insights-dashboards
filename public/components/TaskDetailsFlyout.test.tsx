/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { TaskDetailsFlyout } from './TaskDetailsFlyout';

const mockTaskDetails = {
  id: 'test-task-id',
  timestamp: 1771215528123,
  is_cancelled: false,
  node_id: 'test-node',
  wlm_group_id: 'DEFAULT_WORKLOAD_GROUP',
  description: 'indices[test-index], search_type[QUERY_THEN_FETCH], source[{"query":{"match_all":{}}}]',
  measurements: {
    cpu: { number: 2380000 },
    latency: { number: 1025856750 },
    memory: { number: 128912 }
  },
  index: 'test-index',
  search_type: 'QUERY_THEN_FETCH',
  coordinator_node: 'test-node',
  wlm_group: 'DEFAULT_WORKLOAD_GROUP'
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  taskId: 'test-task-id',
  taskDetails: mockTaskDetails,
  loading: false,
  error: null,
  onRefresh: jest.fn(),
  onKillQuery: jest.fn()
};

describe('TaskDetailsFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders flyout when open', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    expect(screen.getByText('Task ID - test-task-id')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<TaskDetailsFlyout {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Task ID - test-task-id')).not.toBeInTheDocument();
  });

  it('displays task summary information', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    expect(screen.getByText('Task Summary')).toBeInTheDocument();
    expect(screen.getByText('Index:')).toBeInTheDocument();
    expect(screen.getByText('test-index')).toBeInTheDocument();
    expect(screen.getByText('Search Type:')).toBeInTheDocument();
    expect(screen.getByText('QUERY_THEN_FETCH')).toBeInTheDocument();
  });

  it('shows refresh and kill query buttons for running tasks', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    expect(screen.getByText('Kill Query')).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button is clicked', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Refresh'));
    expect(defaultProps.onRefresh).toHaveBeenCalledWith('test-task-id');
  });

  it('calls onKillQuery when kill query button is clicked', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Kill Query'));
    expect(defaultProps.onKillQuery).toHaveBeenCalledWith('test-task-id');
  });

  it('displays loading state', () => {
    render(<TaskDetailsFlyout {...defaultProps} loading={true} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('displays error state', () => {
    render(<TaskDetailsFlyout {...defaultProps} error="Test error" />);
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('displays query source from description', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    expect(screen.getByText('Query Source')).toBeInTheDocument();
    // Should parse and display the JSON from the description
    expect(screen.getByText(/"query"/)).toBeInTheDocument();
  });

  it('formats time and memory values correctly', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    // Should format latency (1025856750 ns = ~1.03s)
    expect(screen.getByText(/1\.03 s/)).toBeInTheDocument();
    // Should format CPU (2380000 ns = 2.38ms)
    expect(screen.getByText(/2\.38 ms/)).toBeInTheDocument();
    // Should format memory (128912 bytes)
    expect(screen.getByText(/125\.89 KB/)).toBeInTheDocument();
  });

  it('parses and displays query source from description field', () => {
    const taskWithComplexQuery = {
      ...mockTaskDetails,
      description: 'indices[test-index], search_type[QUERY_THEN_FETCH], source[{\"query\":{\"bool\":{\"must\":[{\"range\":{\"number\":{\"from\":100}}}]}},\"size\":1000}]'
    };
    
    render(<TaskDetailsFlyout {...defaultProps} taskDetails={taskWithComplexQuery} />);
    
    expect(screen.getByText('Query Source')).toBeInTheDocument();
    expect(screen.getByText(/"query"/)).toBeInTheDocument();
    expect(screen.getByText(/"bool"/)).toBeInTheDocument();
    expect(screen.getByText(/"size"/)).toBeInTheDocument();
    expect(screen.getByText(/1000/)).toBeInTheDocument();
  });

  it('handles malformed query source gracefully', () => {
    const taskWithBadQuery = {
      ...mockTaskDetails,
      description: 'indices[test-index], search_type[QUERY_THEN_FETCH], source[invalid json}]'
    };
    
    render(<TaskDetailsFlyout {...defaultProps} taskDetails={taskWithBadQuery} />);
    
    expect(screen.getByText('Query Source')).toBeInTheDocument();
    expect(screen.getByText(/indices\[test-index\]/)).toBeInTheDocument();
  });

  it('shows running status in blue and bold', () => {
    render(<TaskDetailsFlyout {...defaultProps} />);
    
    const statusElement = screen.getByText(/Running/);
    expect(statusElement).toHaveStyle({ color: '#0073e6', fontWeight: 'bold' });
  });
});