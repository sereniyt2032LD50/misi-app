/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Alert {
  id: string;
  timestamp: number;
  type: 'posture' | 'fall' | 'emotion' | 'system';
  message: string;
  severity: 'low' | 'medium' | 'high';
  groupId?: string;
}

export interface AlertGroup {
  id: string;
  title: string;
  alerts: Alert[];
  lastUpdated: number;
}
