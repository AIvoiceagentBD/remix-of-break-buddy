// Accountability Portal: shared constants, types, and helpers.
import { z } from 'zod';

export const ACCOUNTABILITY_REASONS = [
  'Missed instructed incoming call',
  'Did not dial assigned lead in 5 mins',
  'Excess break time',
  'Unauthorized break',
  'Wrong disposition',
  'No follow-up',
  'Other',
] as const;

export type AccountabilityReason = (typeof ACCOUNTABILITY_REASONS)[number];
export type CaseStatus = 'pending' | 'approved' | 'rejected';

export interface AccountabilityCase {
  id: string;
  agent_id: string;
  agent_name: string;
  reason: string;
  amount: number;
  call_id: string | null;
  proof_link: string | null;
  notes: string | null;
  status: CaseStatus;
  submitted_by: string;
  submitted_by_name: string;
  approved_by: string | null;
  manager_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  case_id: string;
  action: string;
  performed_by: string;
  performed_by_name: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const caseFormSchema = z.object({
  agent_id: z.string().uuid({ message: 'Select an agent' }),
  reason: z.string().min(1, 'Select a reason').max(200),
  amount: z.coerce.number().min(0, 'Amount must be ≥ 0').max(1_000_000),
  call_id: z.string().trim().max(100).optional().or(z.literal('')),
  proof_link: z.string().trim().max(500).url('Must be a valid URL').optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type CaseFormValues = z.infer<typeof caseFormSchema>;

export const STATUS_BADGE: Record<CaseStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Approved', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' },
  rejected: { label: 'Rejected', className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
};

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
