import { Badge } from '@/components/ui/badge';
import { STATUS_BADGE, type CaseStatus } from '@/lib/accountability';

export function StatusBadge({ status }: { status: CaseStatus }) {
  const cfg = STATUS_BADGE[status];
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
