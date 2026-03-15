'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface OrgUnit {
  store_code: string;
  store_name: string;
  active: boolean;
  area?: string;
  business_type?: string;
  manager?: string;
  hq?: string;
  dept?: string;
  section?: string;
}

const EMPTY_FORM = {
  store_code: '',
  store_name: '',
  area: '',
  business_type: '',
  manager: '',
  hq: '',
  dept: '',
  section: '',
};

const NO_GROUP = '（未分類）';

export default function OrgUnitsPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterText, setFilterText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // アコーディオン（業態別）
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<OrgUnit | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchOrgUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/org-units');
      if (res.status === 401) { router.push(`/${companyId}`); return; }
      if (res.status === 403) { router.push(`/${companyId}/survey`); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setOrgUnits(data.org_units ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [companyId, router]);

  useEffect(() => { fetchOrgUnits(); }, [fetchOrgUnits]);

  const filtered = useMemo(() => orgUnits.filter(u => {
    if (!showInactive && !u.active) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      if (
        !u.store_code.toLowerCase().includes(t) &&
        !u.store_name.toLowerCase().includes(t) &&
        !(u.area ?? '').toLowerCase().includes(t) &&
        !(u.business_type ?? '').toLowerCase().includes(t)
      ) return false;
    }
    return true;
  }), [orgUnits, filterText, showInactive]);

  // 業態別グループ
  const businessGroups = useMemo(() => {
    const map = new Map<string, OrgUnit[]>();
    for (const u of filtered) {
      const key = u.business_type || NO_GROUP;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries())
      .map(([business_type, list]) => ({ business_type, list }))
      .sort((a, b) => {
        if (a.business_type === NO_GROUP) return 1;
        if (b.business_type === NO_GROUP) return -1;
        return a.business_type.localeCompare(b.business_type, 'ja');
      });
  }, [filtered]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(businessGroups.map(g => g.business_type)));
  const collapseAll = () => setExpandedGroups(new Set());

  const openAdd = (defaultBusinessType?: string) => {
    setForm({ ...EMPTY_FORM, business_type: defaultBusinessType ?? '' });
    setFormError('');
    setEditTarget(null);
    setModal('add');
  };

  const openEdit = (u: OrgUnit) => {
    setForm({
      store_code: u.store_code,
      store_name: u.store_name,
      area: u.area ?? '',
      business_type: u.business_type ?? '',
      manager: u.manager ?? '',
      hq: u.hq ?? '',
      dept: u.dept ?? '',
      section: u.section ?? '',
    });
    setFormError('');
    setEditTarget(u);
    setModal('edit');
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.store_code.trim()) { setFormError('店舗コードを入力してください'); return; }
    if (!form.store_name.trim()) { setFormError('店舗名を入力してください'); return; }

    setSubmitting(true);
    try {
      const body = {
        store_code: form.store_code.trim(),
        store_name: form.store_name.trim(),
        area: form.area.trim() || undefined,
        business_type: form.business_type.trim() || undefined,
        manager: form.manager.trim() || undefined,
        hq: form.hq.trim() || undefined,
        dept: form.dept.trim() || undefined,
        section: form.section.trim() || undefined,
      };

      if (modal === 'add') {
        const res = await fetch('/api/admin/org-units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || '追加に失敗しました'); return; }
        setOrgUnits(prev => [...prev, data.org_unit]);
        // 追加した業態グループを展開
        setExpandedGroups(prev => new Set([...prev, form.business_type.trim() || NO_GROUP]));
      } else if (modal === 'edit' && editTarget) {
        const res = await fetch('/api/admin/org-units', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || '更新に失敗しました'); return; }
        setOrgUnits(prev => prev.map(u => u.store_code === editTarget.store_code ? data.org_unit : u));
      }
      setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (u: OrgUnit) => {
    const action = u.active ? '無効化' : '有効化';
    if (!confirm(`${u.store_name} を${action}しますか？`)) return;
    try {
      const res = await fetch('/api/admin/org-units', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_code: u.store_code, active: !u.active }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '失敗しました'); return; }
      setOrgUnits(prev => prev.map(x => x.store_code === u.store_code ? { ...x, active: !u.active } : x));
    } catch { alert('エラーが発生しました'); }
  };

  return (
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-800">組織ユニット管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">店舗・組織ユニットの追加・編集を行います</p>
          </div>
          <button
            onClick={() => openAdd()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + 追加
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        {/* フィルタ */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="店舗コード・店舗名・業態・エリアで絞り込み"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-72"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            無効を表示
          </label>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">{filtered.length} 店舗</span>
            <button onClick={expandAll} className="text-xs text-blue-500 hover:text-blue-700">全展開</button>
            <button onClick={collapseAll} className="text-xs text-gray-400 hover:text-gray-600">全折畳</button>
          </div>
        </div>

        {loading && <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>}

        {!loading && !error && (
          <>
            {businessGroups.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
                該当する店舗がありません
              </div>
            ) : (
              <div className="space-y-2">
                {businessGroups.map(({ business_type, list }) => {
                  const isExpanded = expandedGroups.has(business_type);
                  const activeCount = list.filter(u => u.active).length;

                  return (
                    <div key={business_type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* アコーディオンヘッダー */}
                      <button
                        onClick={() => toggleGroup(business_type)}
                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span className="font-medium text-gray-800 text-sm">{business_type}</span>
                          <span className="text-xs text-gray-400">{activeCount}店舗</span>
                          {list.some(u => !u.active) && (
                            <span className="text-xs text-gray-300">（無効含む）</span>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); openAdd(business_type === NO_GROUP ? '' : business_type); }}
                          className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors flex-shrink-0"
                        >
                          + 追加
                        </button>
                        <svg
                          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* 展開コンテンツ */}
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">店舗コード</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">店舗名</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">エリア</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">マネジャー</th>
                                <th className="text-center px-4 py-2 font-medium text-gray-400 text-xs">状態</th>
                                <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map(u => (
                                <tr
                                  key={u.store_code}
                                  className={`border-b border-gray-50 hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}
                                >
                                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{u.store_code}</td>
                                  <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">{u.store_name}</td>
                                  <td className="px-4 py-2.5 text-gray-500 text-sm">{u.area || <span className="text-gray-300">—</span>}</td>
                                  <td className="px-4 py-2.5 text-gray-500 text-sm">{u.manager || <span className="text-gray-300">—</span>}</td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`inline-block w-2 h-2 rounded-full ${u.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex justify-end gap-1">
                                      <button
                                        onClick={() => openEdit(u)}
                                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                                      >
                                        編集
                                      </button>
                                      <button
                                        onClick={() => handleToggleActive(u)}
                                        className={`px-2 py-1 text-xs rounded transition-colors ${
                                          u.active
                                            ? 'bg-red-50 hover:bg-red-100 text-red-600'
                                            : 'bg-green-50 hover:bg-green-100 text-green-600'
                                        }`}
                                      >
                                        {u.active ? '無効化' : '有効化'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* モーダル */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">
                {modal === 'add' ? '組織ユニットを追加' : '組織ユニットを編集'}
              </h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">店舗コード *</label>
                  <input
                    type="text"
                    value={form.store_code}
                    onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))}
                    disabled={modal === 'edit'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                    placeholder="例: 1101"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">店舗名 *</label>
                  <input
                    type="text"
                    value={form.store_name}
                    onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 渋谷店"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">エリア</label>
                  <input
                    type="text"
                    value={form.area}
                    onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 東京"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">業態</label>
                  <input
                    type="text"
                    value={form.business_type}
                    onChange={e => setForm(f => ({ ...f, business_type: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 均タロー"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">マネジャー</label>
                <input
                  type="text"
                  value={form.manager}
                  onChange={e => setForm(f => ({ ...f, manager: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="例: 田中 花子"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">事業本部</label>
                  <input
                    type="text"
                    value={form.hq}
                    onChange={e => setForm(f => ({ ...f, hq: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">事業部</label>
                  <input
                    type="text"
                    value={form.dept}
                    onChange={e => setForm(f => ({ ...f, dept: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">課</label>
                  <input
                    type="text"
                    value={form.section}
                    onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
