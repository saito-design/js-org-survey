import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName } from '@/lib/drive';
import { loadRespondents, loadOrgUnits, loadResponsesDirect, loadResponses } from '@/lib/data-fetching';
import { listSurveyIds } from '@/lib/manifest';
import { GATE_QUESTION_BY_ROLE } from '@/lib/aggregation';

export const dynamic = 'force-dynamic';

export interface RespondentProgress {
  respondent_id: string;
  emp_no: string;
  name?: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  answered: boolean;
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

function normalizeRole(role: string): 'MANAGER' | 'STAFF' | 'PA' {
  if (role === 'PART_TIME' || role === 'PARTTIME') return 'PA';
  if (role === 'MANAGER') return 'MANAGER';
  return 'STAFF';
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
    // RESPONSES_FOLDER_ID が設定されている場合はそちらを優先
    const responsesFolderId = process.env.RESPONSES_FOLDER_ID;
    let surveyIds: string[];
    if (responsesFolderId) {
      const { listFilesInFolder } = await import('@/lib/drive');
      const folders = await listFilesInFolder(responsesFolderId, `mimeType='application/vnd.google-apps.folder'`);
      const pattern = /^\d{4}-\d{2}$/;
      surveyIds = folders
        .filter(f => f.name && pattern.test(f.name))
        .map(f => f.name!)
        .sort()
        .reverse();
    } else {
      surveyIds = await listSurveyIds(rootId);
    }

    const now = new Date();
    const currentSurveyId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const requestedId = searchParams.get('survey_id') || surveyIds[0] || currentSurveyId;

    // setup/ から respondents・org_units を取得
    const setupFolder = await findFileByName('setup', rootId);
    const setupFolderId = setupFolder?.id || rootId;
    const recordingFolder = await findFileByName('recording', rootId);
    const recordingFolderId = recordingFolder?.id || rootId;

    const [respondents, orgUnits] = await Promise.all([
      loadRespondents(setupFolderId),
      loadOrgUnits(setupFolderId),
    ]);

    // 該当サーベイ期の回答データを読み込む
    let responses: Awaited<ReturnType<typeof loadResponsesDirect>> = [];
    try {
      if (responsesFolderId) {
        responses = await loadResponsesDirect(responsesFolderId, requestedId);
      } else {
        responses = await loadResponses(recordingFolderId, requestedId);
      }
    } catch {
      // 回答データが取得できなくても進捗ページは表示する（全員未回答として扱う）
    }

    // ゲート設問に回答した respondent_id のセット
    const answeredSet = new Set<string>();
    for (const res of responses) {
      if (res.value == null) continue;
      const role = normalizeRole(res.question_id.split('-')[0]);
      const gateQ = GATE_QUESTION_BY_ROLE[role];
      if (res.question_id === gateQ) {
        answeredSet.add(res.respondent_id);
      }
    }

    // 店舗マップ（store_code → store_name）
    const storeNameMap = new Map<string, string>(
      orgUnits.map(u => [u.store_code, u.store_name])
    );

    // active な回答者を店舗別にグループ化
    const storeMap = new Map<string, RespondentProgress[]>();
    for (const r of respondents) {
      if (!r.active) continue;
      const role = normalizeRole(r.role) as 'MANAGER' | 'STAFF' | 'PA';
      const prog: RespondentProgress = {
        respondent_id: r.respondent_id,
        emp_no: r.emp_no,
        name: r.name,
        role,
        answered: answeredSet.has(r.respondent_id),
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
