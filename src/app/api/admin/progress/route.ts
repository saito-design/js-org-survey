import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { loadRespondents, loadOrgUnits } from '@/lib/data-fetching';
import { loadManifest, listSurveyIds } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export interface RespondentProgress {
  respondent_id: string;
  emp_no: string;
  name?: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  answered: boolean;
  answered_at?: string;
}

export interface StoreProgress {
  store_code: string;
  store_name: string;
  total: number;
  answered: number;
  rate: number;
  respondents: RespondentProgress[];
}

export interface ProgressResponse {
  survey_id: string;
  survey_ids: string[];
  overall_total: number;
  overall_answered: number;
  overall_rate: number;
  stores: StoreProgress[];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const { searchParams } = new URL(req.url);

    // 利用可能な survey_id 一覧
    const surveyIds = await listSurveyIds(rootId);

    // デフォルト: 最新の survey_id
    const now = new Date();
    const currentSurveyId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const requestedId = searchParams.get('survey_id') || surveyIds[0] || currentSurveyId;

    // 回答者一覧とマニフェストを並行取得
    const [respondents, orgUnits, manifestEntries] = await Promise.all([
      loadRespondents(rootId),
      loadOrgUnits(rootId),
      loadManifest(rootId, requestedId),
    ]);

    // 回答済み respondent_id のセット
    const answeredSet = new Map<string, string>(); // respondent_id → updated_at
    for (const entry of manifestEntries) {
      answeredSet.set(entry.respondent_id, entry.updated_at);
    }

    // 店舗マップ（store_code → store_name）
    const storeNameMap = new Map<string, string>(
      orgUnits.map(u => [u.store_code, u.store_name])
    );

    // active な回答者を店舗別にグループ化
    const storeMap = new Map<string, RespondentProgress[]>();
    for (const r of respondents) {
      if (!r.active) continue;
      const prog: RespondentProgress = {
        respondent_id: r.respondent_id,
        emp_no: r.emp_no,
        name: r.name,
        role: r.role,
        answered: answeredSet.has(r.respondent_id),
        answered_at: answeredSet.get(r.respondent_id),
      };
      if (!storeMap.has(r.store_code)) storeMap.set(r.store_code, []);
      storeMap.get(r.store_code)!.push(prog);
    }

    // 店舗別進捗を生成（店舗名順でソート）
    const stores: StoreProgress[] = Array.from(storeMap.entries())
      .map(([store_code, respondentList]) => {
        const answered = respondentList.filter(r => r.answered).length;
        return {
          store_code,
          store_name: storeNameMap.get(store_code) || store_code,
          total: respondentList.length,
          answered,
          rate: respondentList.length > 0 ? Math.round((answered / respondentList.length) * 100) : 0,
          respondents: respondentList,
        };
      })
      .sort((a, b) => a.store_name.localeCompare(b.store_name, 'ja'));

    const overall_total = stores.reduce((sum, s) => sum + s.total, 0);
    const overall_answered = stores.reduce((sum, s) => sum + s.answered, 0);

    const result: ProgressResponse = {
      survey_id: requestedId,
      survey_ids: surveyIds,
      overall_total,
      overall_answered,
      overall_rate: overall_total > 0 ? Math.round((overall_answered / overall_total) * 100) : 0,
      stores,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/admin/progress error:', error);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}
