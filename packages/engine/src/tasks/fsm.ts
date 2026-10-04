import { FokerError } from '@foker/core';
import type { NextAction, TaskState } from '@foker/schemas';
export const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  PENDING: ['PLANNED', 'CANCELLED'],
  PLANNED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['COMPLETED', 'REJECTED', 'AWAITING_APPROVAL', 'BLOCKED'],
  REJECTED: ['RUNNING', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['COMPLETED', 'REJECTED', 'CANCELLED'],
  BLOCKED: ['RUNNING', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
export function assertTransition(from: TaskState, to: TaskState): void {
  if (!TRANSITIONS[from].includes(to)) throw new FokerError('FKR-TSK-002', `${from} → ${to} no permitido`);
}
export function nextAction(state: TaskState, attempt: number): NextAction {
  switch (state) {
    case 'COMPLETED':
      return 'done';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'AWAITING_APPROVAL':
      return 'await_human_approval';
    case 'BLOCKED':
      return 'blocked_contact_human';
    case 'REJECTED':
      return 'fix_and_resubmit';
    default:
      return attempt > 1 ? 'fix_and_resubmit' : 'work_and_submit';
  }
}
