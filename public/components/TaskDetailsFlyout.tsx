/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiButton,
  EuiText,
  EuiPanel,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { Duration } from 'luxon';
import { filesize } from 'filesize';
import { NANOSECONDS_TO_SECONDS } from '../../common/constants';

interface TaskDetailsFlyoutProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  taskDetails: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  onRefresh: (taskId: string) => void;
  onKillQuery: (taskId: string) => void;
}

export const TaskDetailsFlyout: React.FC<TaskDetailsFlyoutProps> = ({
  isOpen,
  onClose,
  taskId,
  taskDetails,
  loading,
  error,
  onRefresh,
  onKillQuery,
}) => {
  const formatTime = (seconds: number): string => {
    if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(2)} µs`;
    if (seconds < 1) return `${(seconds * 1e3).toFixed(2)} ms`;

    const duration = Duration.fromObject({ seconds }).shiftTo(
      'days',
      'hours',
      'minutes',
      'seconds'
    );
    const parts = [];

    if (duration.days) parts.push(`${duration.days} d`);
    if (duration.hours) parts.push(`${duration.hours} h`);
    if (duration.minutes) parts.push(`${duration.minutes} m`);
    if (duration.seconds) parts.push(`${duration.seconds.toFixed(2)} s`);

    return parts.join(' ');
  };

  const formatMemory = (bytes: number): string => {
    return filesize(bytes, { base: 2, standard: 'jedec' });
  };

  type TaskState = 'start' | 'running' | 'completed' | 'failed';

  const getTaskState = (details: Record<string, unknown> | null): TaskState => {
    if (!details) return 'start';

    if (details?.error || details?.failed === true) {
      return 'failed';
    }

    if (details?.is_cancelled === true) {
      return 'failed';
    }

    if (details?.end_time) {
      return 'completed';
    }

    return 'running';
  };

  const getStatusText = (state: TaskState, runningSeconds?: number): string => {
    if (state === 'failed') {
      return taskDetails?.is_cancelled ? 'Cancelled' : 'Failed';
    }
    if (state === 'completed') {
      return 'Completed';
    }
    if (state === 'running') {
      return runningSeconds != null
        ? `Running - ${Duration.fromObject({ seconds: runningSeconds }).toFormat('mm:ss')}`
        : 'Running';
    }
    return 'Start';
  };

  const getStatusColor = (details: Record<string, unknown> | null): string => {
    console.log('Task details in flyout:', details);
    console.log('is_cancelled value:', details?.is_cancelled, typeof details?.is_cancelled);
    if (details?.is_cancelled === true) return '#BD271E';
    return '#0073e6';
  };

  const convertTime = (unixTime: number) => {
    const date = new Date(unixTime);
    const loc = date.toDateString().split(' ');
    return `${loc[1]} ${loc[2]}, ${loc[3]} @ ${date.toLocaleTimeString('en-US')}`;
  };

  if (!isOpen) return null;

  return (
    <EuiFlyout onClose={onClose} size="l" type="overlay" ownFocus aria-labelledby="taskFlyoutTitle" data-test-subj="euiFlyout">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" style={{ paddingRight: '40px' }}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="m">
              <h2 id="taskFlyoutTitle">Task ID - {taskId}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {getTaskState(taskDetails) === 'running' && (
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="refresh"
                    onClick={() => taskId && onRefresh(taskId)}
                    disabled={!taskId || loading}
                    size="s"
                  >
                    Refresh
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton 
                    iconType="trash" 
                    color="danger" 
                    onClick={() => taskId && onKillQuery(taskId)}
                    size="s"
                  >
                    Kill Query
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {loading ? (
          <EuiText>
            <p>Loading…</p>
          </EuiText>
        ) : error ? (
          <EuiText color="danger">
            <p>{error}</p>
          </EuiText>
        ) : taskDetails ? (
          <>
            <EuiPanel paddingSize="m">
              <EuiTitle size="s">
                <h3>Task Summary</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiText>
                    <strong>Status:</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <span style={{ 
                      color: getStatusColor(taskDetails), 
                      fontWeight: 'bold' 
                    }}>
                      {getStatusText(
                        getTaskState(taskDetails),
                        getTaskState(taskDetails) === 'running' &&
                        taskDetails?.measurements?.latency?.number
                          ? taskDetails.measurements.latency.number / NANOSECONDS_TO_SECONDS
                          : undefined
                      )}
                    </span>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="m" />
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Start Time:</strong>{' '}
                    {convertTime(taskDetails.start_time || taskDetails.timestamp)}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>End Time:</strong>{' '}
                    {taskDetails.end_time ? convertTime(taskDetails.end_time) : '-'}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Index:</strong> {taskDetails.index}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Coordinator Node:</strong> {taskDetails.coordinator_node}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Search Type:</strong> {taskDetails.search_type}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>WLM Group:</strong> {taskDetails.wlm_group}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Time Elapsed:</strong>{' '}
                    {formatTime(taskDetails.measurements?.latency?.number / NANOSECONDS_TO_SECONDS)}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>CPU Usage:</strong>{' '}
                    {formatTime(taskDetails.measurements?.cpu?.number / NANOSECONDS_TO_SECONDS)}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText>
                    <strong>Memory Usage:</strong>{' '}
                    {formatMemory(taskDetails.measurements?.memory?.number)}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="m" />
            <EuiPanel paddingSize="m">
              <EuiTitle size="s">
                <h3>Task Resource Usage</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiText color="subdued">
                <p>No detailed resource usage data available for this task.</p>
              </EuiText>
            </EuiPanel>
            <EuiSpacer size="m" />
            <EuiPanel paddingSize="m">
              <EuiTitle size="s">
                <h3>Query Source</h3>
              </EuiTitle>
              <EuiSpacer size="m" />
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '12px',
                  maxHeight: '400px'
                }}
              >
                {(() => {
                  try {
                    const sourceMatch = taskDetails.description?.match(/source\[(.*)\]$/);
                    if (sourceMatch) {
                      const sourceStr = sourceMatch[1].replace(/\\&quot;/g, '"');
                      const sourceObj = JSON.parse(sourceStr);
                      return JSON.stringify(sourceObj, null, 2);
                    }
                    return taskDetails.description || 'No query source available';
                  } catch (e) {
                    return taskDetails.description || 'No query source available';
                  }
                })()}
              </pre>
            </EuiPanel>
          </>
        ) : (
          <EuiText color="subdued">
            <p>No details loaded.</p>
          </EuiText>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};