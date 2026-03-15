import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, saveJsonFile, ensureFolder } from '@/lib/drive';
import { loadRespondents } from '@/lib/data-fetching';
import { Respondent, RespondentsMaster } from '@/lib/types';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateRespondentId(existing: Respondent[]): string {
  const max = existing.reduce((acc, r) => {
    const n = parseInt(r.respondent_id.replace(/\D/g, ''), 10);
    return isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `R${String(max + 1).padStart(5, '0')}`;
}

async function saveRespondents(respondents: Respondent[], rootId: string): Promise<void> {
  const setupFolder = await ensureFolder('setup', rootId);
  const existingFile = await findFileByName('respondents.json', setupFolder, 'application/json');
  const master: RespondentsMaster = { respondents, updated_at: new Date().toISOString() };
  await saveJsonFile(master, 'respondents.json', setupFolder, existingFile?.id ?? undefined);
}

// レスポンス用: password_hash を除く
function sanitize(r: Respondent): Omit<Respondent, 'password_hash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...rest } = r;
  return rest;
}

// GET: 一覧取得
export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const respondents = await loadRespondents(rootId);
    return NextResponse.json({ respondents: respondents.map(sanitize) });
  } catch (error) {
    console.error('GET /api/admin/respondents error:', error);
    return NextResponse.json({ error: 'Failed to load respondents' }, { status: 500 });
  }
}

// POST: 新規追加
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { emp_no, name, role, store_code, password, is_admin, is_owner } = body as {
      emp_no: string;
      name?: string;
      role: 'MANAGER' | 'STAFF' | 'PA';
      store_code: string;
      password?: string;
      is_admin?: boolean;
      is_owner?: boolean;
    };

    if (!emp_no || !role || !store_code) {
      return NextResponse.json({ error: '社員番号・役割・店舗コードは必須です' }, { status: 400 });
    }
    if (!['MANAGER', 'STAFF', 'PA'].includes(role)) {
      return NextResponse.json({ error: '役割が無効です' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const existing = await loadRespondents(rootId);
    if (existing.some(r => r.emp_no === emp_no)) {
      return NextResponse.json({ error: 'この社員番号は既に登録されています' }, { status: 409 });
    }

    const newRespondent: Respondent = {
      respondent_id: generateRespondentId(existing),
      emp_no: String(emp_no).slice(0, 20),
      password_hash: hashPassword(password || emp_no),
      role,
      store_code: String(store_code).slice(0, 20),
      name: name ? String(name).slice(0, 50) : undefined,
      active: true,
      is_admin: is_admin ?? false,
      is_owner: is_owner ?? false,
    };

    await saveRespondents([...existing, newRespondent], rootId);
    return NextResponse.json({ respondent: sanitize(newRespondent) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/respondents error:', error);
    return NextResponse.json({ error: 'Failed to create respondent' }, { status: 500 });
  }
}

// PATCH: 更新（パスワードリセット含む）
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { respondent_id, name, role, store_code, reset_password, is_admin, is_owner, active } = body as {
      respondent_id: string;
      name?: string;
      role?: 'MANAGER' | 'STAFF' | 'PA';
      store_code?: string;
      reset_password?: boolean;
      is_admin?: boolean;
      is_owner?: boolean;
      active?: boolean;
    };

    if (!respondent_id) return NextResponse.json({ error: 'respondent_id は必須です' }, { status: 400 });
    if (role && !['MANAGER', 'STAFF', 'PA'].includes(role)) {
      return NextResponse.json({ error: '役割が無効です' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const respondents = await loadRespondents(rootId);
    const idx = respondents.findIndex(r => r.respondent_id === respondent_id);
    if (idx === -1) return NextResponse.json({ error: '対象者が見つかりません' }, { status: 404 });

    const current = respondents[idx];
    const updated: Respondent = {
      ...current,
      name: name !== undefined ? String(name).slice(0, 50) : current.name,
      role: role ?? current.role,
      store_code: store_code !== undefined ? String(store_code).slice(0, 20) : current.store_code,
      is_admin: is_admin !== undefined ? is_admin : current.is_admin,
      is_owner: is_owner !== undefined ? is_owner : current.is_owner,
      active: active !== undefined ? active : current.active,
      password_hash: reset_password ? hashPassword(current.emp_no) : current.password_hash,
    };

    respondents[idx] = updated;
    await saveRespondents(respondents, rootId);
    return NextResponse.json({ respondent: sanitize(updated) });
  } catch (error) {
    console.error('PATCH /api/admin/respondents error:', error);
    return NextResponse.json({ error: 'Failed to update respondent' }, { status: 500 });
  }
}

// DELETE: soft-delete（active: false）
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const respondent_id = searchParams.get('id');
    if (!respondent_id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const respondents = await loadRespondents(rootId);
    const idx = respondents.findIndex(r => r.respondent_id === respondent_id);
    if (idx === -1) return NextResponse.json({ error: '対象者が見つかりません' }, { status: 404 });

    respondents[idx] = { ...respondents[idx], active: false };
    await saveRespondents(respondents, rootId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/admin/respondents error:', error);
    return NextResponse.json({ error: 'Failed to deactivate respondent' }, { status: 500 });
  }
}
