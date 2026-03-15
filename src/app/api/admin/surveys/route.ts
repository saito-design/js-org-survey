import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listSurveyIds, loadManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export interface SurveyPeriod {
  survey_id: string;
  respondent_count: number;
  updated_at: string | null;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const surveyIds = await listSurveyIds(rootId);

    // 各期間のマニフェストを並行取得してカウント
    const periods: SurveyPeriod[] = await Promise.all(
      surveyIds.map(async (survey_id) => {
        try {
          const entries = await loadManifest(rootId, survey_id);
          const updated_at = entries.length > 0
            ? entries.reduce((latest, e) => e.updated_at > latest ? e.updated_at : latest, entries[0].updated_at)
            : null;
          return { survey_id, respondent_count: entries.length, updated_at };
        } catch {
          return { survey_id, respondent_count: 0, updated_at: null };
        }
      })
    );

    return NextResponse.json({ periods });
  } catch (error) {
    console.error('GET /api/admin/surveys error:', error);
    return NextResponse.json({ error: 'Failed to load surveys' }, { status: 500 });
  }
}
