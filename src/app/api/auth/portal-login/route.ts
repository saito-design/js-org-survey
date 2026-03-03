import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

function decodePortalToken(token: string): { role: string; company: string; exp: number } | null {
  try {
    return JSON.parse(atob(token));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, companyId } = await req.json();

    if (!token || !companyId) {
      return NextResponse.json({ error: 'Missing token or companyId' }, { status: 400 });
    }

    const decoded = decodePortalToken(token);
    if (!decoded || decoded.exp <= Date.now() || decoded.company !== companyId) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // ポータルトークンが有効 → オーナー権限でセッションを作成
    const session = await getSession();
    session.respondent_id = 'portal';
    session.emp_no = 'portal';
    session.role = 'MANAGER';
    session.store_code = '0';
    session.name = 'ポータルユーザー';
    session.anonymous = false;
    session.isLoggedIn = true;
    session.is_admin = true;
    session.is_owner = true;
    await session.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Portal login error:', error);
    return NextResponse.json({ error: 'ログイン処理に失敗しました' }, { status: 500 });
  }
}
