import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, saveJsonFile, ensureFolder } from '@/lib/drive';
import { loadOrgUnits } from '@/lib/data-fetching';
import { OrgUnit, OrgUnitsMaster } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function saveOrgUnits(orgUnits: OrgUnit[], rootId: string): Promise<void> {
  const setupFolder = await ensureFolder('setup', rootId);
  const existingFile = await findFileByName('org_units.json', setupFolder, 'application/json');
  const master: OrgUnitsMaster = { org_units: orgUnits, updated_at: new Date().toISOString() };
  await saveJsonFile(master, 'org_units.json', setupFolder, existingFile?.id ?? undefined);
}

// GET: 一覧取得
export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const orgUnits = await loadOrgUnits(rootId);
    return NextResponse.json({ org_units: orgUnits });
  } catch (error) {
    console.error('GET /api/admin/org-units error:', error);
    return NextResponse.json({ error: 'Failed to load org units' }, { status: 500 });
  }
}

// POST: 新規追加
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { store_code, store_name, area, business_type, manager, hq, dept, section } = body as {
      store_code: string;
      store_name: string;
      area?: string;
      business_type?: string;
      manager?: string;
      hq?: string;
      dept?: string;
      section?: string;
    };

    if (!store_code || !store_name) {
      return NextResponse.json({ error: '店舗コードと店舗名は必須です' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const existing = await loadOrgUnits(rootId);
    if (existing.some(u => u.store_code === store_code)) {
      return NextResponse.json({ error: 'この店舗コードは既に登録されています' }, { status: 409 });
    }

    const newUnit: OrgUnit = {
      store_code: String(store_code).slice(0, 20),
      store_name: String(store_name).slice(0, 100),
      active: true,
      area: area ? String(area).slice(0, 50) : undefined,
      business_type: business_type ? String(business_type).slice(0, 50) : undefined,
      manager: manager ? String(manager).slice(0, 50) : undefined,
      hq: hq ? String(hq).slice(0, 50) : undefined,
      dept: dept ? String(dept).slice(0, 50) : undefined,
      section: section ? String(section).slice(0, 50) : undefined,
    };

    await saveOrgUnits([...existing, newUnit], rootId);
    return NextResponse.json({ org_unit: newUnit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/org-units error:', error);
    return NextResponse.json({ error: 'Failed to create org unit' }, { status: 500 });
  }
}

// PATCH: 更新
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { store_code, store_name, area, business_type, manager, hq, dept, section, active } = body as {
      store_code: string;
      store_name?: string;
      area?: string;
      business_type?: string;
      manager?: string;
      hq?: string;
      dept?: string;
      section?: string;
      active?: boolean;
    };

    if (!store_code) return NextResponse.json({ error: 'store_code は必須です' }, { status: 400 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const orgUnits = await loadOrgUnits(rootId);
    const idx = orgUnits.findIndex(u => u.store_code === store_code);
    if (idx === -1) return NextResponse.json({ error: '対象ユニットが見つかりません' }, { status: 404 });

    const current = orgUnits[idx];
    orgUnits[idx] = {
      ...current,
      store_name: store_name !== undefined ? String(store_name).slice(0, 100) : current.store_name,
      area: area !== undefined ? String(area).slice(0, 50) : current.area,
      business_type: business_type !== undefined ? String(business_type).slice(0, 50) : current.business_type,
      manager: manager !== undefined ? String(manager).slice(0, 50) : current.manager,
      hq: hq !== undefined ? String(hq).slice(0, 50) : current.hq,
      dept: dept !== undefined ? String(dept).slice(0, 50) : current.dept,
      section: section !== undefined ? String(section).slice(0, 50) : current.section,
      active: active !== undefined ? active : current.active,
    };

    await saveOrgUnits(orgUnits, rootId);
    return NextResponse.json({ org_unit: orgUnits[idx] });
  } catch (error) {
    console.error('PATCH /api/admin/org-units error:', error);
    return NextResponse.json({ error: 'Failed to update org unit' }, { status: 500 });
  }
}
