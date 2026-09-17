import { Badge } from '@/components/ui/Badge';
import type { CompetitorStatus } from '@/types';

const STATUS_COLOR = {
  조사중: 'gray',
  자료수집됨: 'blue',
  정리완료: 'teal',
  벤치마킹도출: 'green',
} as const;

export function StatusBadge({ status }: { status: CompetitorStatus }) {
  return <Badge color={STATUS_COLOR[status]}>{status}</Badge>;
}

export default StatusBadge;
