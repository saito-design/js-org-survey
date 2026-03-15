'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

interface RespondentProgress {
  respondent_id: string;
  emp_no: string;
  name?: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  answered: boolean;
  answered_at?: string;
}

interface StoreProgress {
  store_code: string;
  store_name: string;
  total: number;
  answered: number;
  rate: number;
  respondents: RespondentProgress[];
}

interface ProgressData {
  survey_id: string;
  survey_ids: string[];
  overall_total: number;
  overall_answered: number;
  overall_rate: number;
  stores: StoreProgress[];
}

const ROLE_LABELS: Record<string, string> = {
  MANAGER: '店長',
  STAFF: '社員',
  PA: 'PA',
};

export default function ProgressPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const searchParams = useSearchParams();

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState(searchParams.get('survey_id') || '');
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());

  const fetchProgress = useCallback(async (surveyId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = surveyId ? `/api/admin/progress?survey_id=${surveyId}` : '/api/admin/progress';
      const res = await fetch(url);
      if (res.status === 401) { router.push(`/${companyId}`); return; }
      if (res.status === 403) { router.push(`/${companyId}/survey`); return; }
      if (!res.ok) throw new Error('Failed to load');
      const d: ProgressData = await res.json();
      setData(d);
      setSelectedSurveyId(d.survey_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [companyId, router]);

  useEffect(() => {
    const id = searchParams.get('survey_id') || undefined;
    fetchProgress(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSurveyChange = (id: string) => {
    setSelectedSurveyId(id);
    fetchProgress(id);
  };

  const toggleStore = (storeCode: string) => {
    setExpandedStores(prev => {
      const next = new Set(prev);
      if (next.has(storeCode)) next.delete(storeCode);
      else next.add(storeCode);
      return next;
    });
  };

  const getRateColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 50) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  const getRateTextColor = (rate: number) => {
    if (rate >= 80) return 'text-green-700';
    if (rate >= 50) return 'text-yellow-700';
    return 'text-red-600';
  };

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-800">回答進捗</h1>
            <p className="text-xs text-gray-400 mt-0.5">回答者ごとの回答状況を確認できます</p>
          </div>
          {data && data.survey_ids.length > 0 && (
            <select
              value={selectedSurveyId}
              onChange={e => handleSurveyChange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {data.survey_ids.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {loading && <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>}

        {!loading && data && (
          <>
            {/* 全体サマリー */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-600">
                  全体回答率 — {data.survey_id}
                </span>
                <span className={`text-xl font-bold ${getRateTextColor(data.overall_rate)}`}>
                  {data.overall_rate}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className={`${getRateColor(data.overall_rate)} h-3 rounded-full transition-all`}
                  style={{ width: `${data.overall_rate}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {data.overall_answered} / {data.overall_total} 名が回答済み
              </p>
            </div>

            {/* 店舗別 */}
            {data.stores.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
                このサーベイ期の回答データがありません
              </div>
            ) : (
              <div className="space-y-2">
                {data.stores.map(store => (
                  <div key={store.store_code} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleStore(store.store_code)}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-medium text-gray-800 text-sm">{store.store_name}</span>
                          <span className="text-xs text-gray-400 font-mono">{store.store_code}</span>
                          <span className={`text-xs font-bold ${getRateTextColor(store.rate)}`}>
                            {store.rate}%
                          </span>
                          <span className="text-xs text-gray-400">
                            {store.answered}/{store.total}名
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`${getRateColor(store.rate)} h-2 rounded-full transition-all`}
                            style={{ width: `${store.rate}%` }}
                          />
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedStores.has(store.store_code) ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedStores.has(store.store_code) && (
                      <div className="border-t border-gray-100 px-5 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {store.respondents.map(r => (
                            <div
                              key={r.respondent_id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                r.answered ? 'bg-green-50' : 'bg-gray-50'
                              }`}
                            >
                              <span className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-xs ${
                                r.answered ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
                              }`}>
                                {r.answered && (
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium truncate ${r.answered ? 'text-green-800' : 'text-gray-600'}`}>
                                  {r.name || r.emp_no}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {ROLE_LABELS[r.role] || r.role}
                                  {r.answered_at && (
                                    <span className="ml-1">· {new Date(r.answered_at).toLocaleDateString('ja-JP')}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
