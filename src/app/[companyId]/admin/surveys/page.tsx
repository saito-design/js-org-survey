'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface SurveyPeriod {
  survey_id: string;
  respondent_count: number;
  updated_at: string | null;
}

export default function SurveysPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const [periods, setPeriods] = useState<SurveyPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/surveys');
      if (res.status === 401) { router.push(`/${companyId}`); return; }
      if (res.status === 403) { router.push(`/${companyId}/survey`); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [companyId, router]);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  // YYYY-MM を "YYYY年M月" に変換
  const formatSurveyId = (id: string) => {
    const [year, month] = id.split('-');
    return `${year}年${parseInt(month)}月`;
  };

  const now = new Date();
  const currentSurveyId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg font-bold text-gray-800">サーベイ期管理</h1>
          <p className="text-xs text-gray-400 mt-0.5">実施済みサーベイの一覧です。サーベイ期は回答が登録されると自動的に作成されます。</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading && <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>}

        {!loading && !error && (
          <>
            {periods.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <p className="text-gray-400 text-sm">サーベイデータがありません</p>
                <p className="text-gray-300 text-xs mt-1">回答者がアンケートに回答するとサーベイ期が自動作成されます</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs">期間</th>
                      <th className="text-center px-6 py-3 font-medium text-gray-500 text-xs">回答者数</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs">最終更新</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500 text-xs">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((period, idx) => {
                      const isCurrent = period.survey_id === currentSurveyId;
                      return (
                        <tr key={period.survey_id} className={`border-b border-gray-50 hover:bg-gray-50 ${idx === 0 ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{formatSurveyId(period.survey_id)}</span>
                              <span className="font-mono text-xs text-gray-400">{period.survey_id}</span>
                              {isCurrent && (
                                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                                  今月
                                </span>
                              )}
                              {idx === 0 && !isCurrent && (
                                <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium">
                                  最新
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`font-bold text-base ${period.respondent_count > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                              {period.respondent_count}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">名</span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {period.updated_at
                              ? new Date(period.updated_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <Link
                                href={`/${companyId}/admin/progress?survey_id=${period.survey_id}`}
                                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                              >
                                進捗確認
                              </Link>
                              <Link
                                href={`/${companyId}/admin/summary?as_of=${period.survey_id}`}
                                className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 rounded text-blue-600 transition-colors"
                              >
                                集計結果
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
