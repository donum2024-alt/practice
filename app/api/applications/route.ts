import { getDB } from '@/lib/db';
import { isApplicationStatus, type Application } from '@/types';

const BIZ_FIELDS = [
  'biz_name',
  'biz_reg_no',
  'representative',
  'industry',
  'business_type',
  'expected_sales',
] as const;

export async function GET(req: Request) {
  const db = getDB();
  const status = new URL(req.url).searchParams.get('status');

  if (status && !isApplicationStatus(status)) {
    return Response.json({ error: '알 수 없는 상태입니다.' }, { status: 400 });
  }

  const rows = status
    ? db
        .prepare('SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC, id DESC')
        .all(status)
    : db.prepare('SELECT * FROM applications ORDER BY created_at DESC, id DESC').all();

  return Response.json(rows as Application[]);
}

export async function POST(req: Request) {
  const db = getDB();
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const missing = BIZ_FIELDS.filter((f) => {
    const v = (body as Record<string, unknown>)[f];
    return typeof v !== 'string' || v.trim() === '';
  });

  if (missing.length > 0) {
    return Response.json({ error: '필수 항목이 비어 있습니다.', missing }, { status: 400 });
  }

  const agencyRaw = (body as Record<string, unknown>).agency;
  const agency = typeof agencyRaw === 'string' && agencyRaw.trim() !== '' ? agencyRaw.trim() : null;

  const result = db
    .prepare(
      `INSERT INTO applications
         (biz_name, biz_reg_no, representative, industry, business_type, expected_sales, agency, status)
       VALUES (@biz_name, @biz_reg_no, @representative, @industry, @business_type, @expected_sales, @agency, '접수')`,
    )
    .run({
      biz_name: (body as Record<string, string>).biz_name.trim(),
      biz_reg_no: (body as Record<string, string>).biz_reg_no.trim(),
      representative: (body as Record<string, string>).representative.trim(),
      industry: (body as Record<string, string>).industry.trim(),
      business_type: (body as Record<string, string>).business_type.trim(),
      expected_sales: (body as Record<string, string>).expected_sales.trim(),
      agency,
    });

  const created = db
    .prepare('SELECT * FROM applications WHERE id = ?')
    .get(result.lastInsertRowid) as Application;

  return Response.json(created, { status: 201 });
}
