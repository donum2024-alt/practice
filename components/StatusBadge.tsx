import { Badge } from '@/components/ui/Badge';
import type { ApplicationStatus } from '@/types';

const STATUS_COLOR = {
  접수: 'gray',
  서류보완: 'yellow',
  심사중: 'blue',
  팀장승인대기: 'yellow',
  승인완료: 'green',
  반려: 'red',
} as const;

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge color={STATUS_COLOR[status]}>{status}</Badge>;
}

export default StatusBadge;
