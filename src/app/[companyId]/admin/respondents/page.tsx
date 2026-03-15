'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface Respondent {
  respondent_id: string;
  emp_no: string;
  name?: string;
  role: 'MANAGER' | 'STAFF' | 'PA';
  store_code: string;
  anonymous?: boolean;
  active: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  MANAGER: '店長',
  STAFF: '社員',
  PA: 'PA',
};

const ROLE_COLORS: Record<string, string> = {
  MANAGER: 'bg-blue-100 text-blue-700',
  STAFF: 'bg-green-100 text-green-700',
  PA: 'bg-gray-100 text-gray-600',
};

const EMPTY_FORM = {
  emp_no: '',
  name: '',
  role: 'STAFF' as 'MANAGER' | 'STAFF' | 'PA',
  store_code: '',
  password: '',
  is_admin: false,
  is_owner: false,
};

export default function RespondentsPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フィルタ
  const [filterRole, setFilterRole] = useState('');
  const [filterText, setFilterText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // アコーディオン
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());

  // モーダル
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Respondent | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchRespondents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/respondents');
      if (res.status === 401) { router.push(`/${companyId}`); return; }
      if (res.status === 403) { router.push(`/${companyId}/survey`); return; }
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setRespondents(data.respondents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [companyId, router]);

  useEffect(() => { fetchRespondents(); }, [fetchRespondents]);

  // フィルタ後の回答者
  const filtered = useMemo(() => respondents.filter(r => {
    if (!showInactive && !r.active) return false;
    if (filterRole && r.role !== filterRole) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      if (
        !r.store_code.toLowerCase().includes(t) &&
        !r.emp_no.toLowerCase().includes(t) &&
        !(r.name ?? '').toLowerCase().includes(t)
      ) return false;
    }
    return true;
  }), [respondents, filterRole, filterText, showInactive]);

  // 店舗別グループ
  const storeGroups = useMemo(() => {
    const map = new Map<string, Respondent[]>();
    for (const r of filtered) {
      if (!map.has(r.store_code)) map.set(r.store_code, []);
      map.get(r.store_code)!.push(r);
    }
    return Array.from(map.entries())
      .map(([store_code, list]) => ({ store_code, list }))
      .sort((a, b) => a.store_code.localeCompare(b.store_code));
  }, [filtered]);

  const toggleStore = (storeCode: string) => {
    setExpandedStores(prev => {
      const next = new Set(prev);
      if (next.has(storeCode)) next.delete(storeCode);
      else next.add(storeCode);
      return next;
    });
  };

  const expandAll = () => setExpandedStores(new Set(storeGroups.map(g => g.store_code)));
  const collapseAll = () => setExpandedStores(new Set());

  const openAdd = (defaultStoreCode?: string) => {
    setForm({ ...EMPTY_FORM, store_code: defaultStoreCode ?? '' });
    setFormError('');
    setEditTarget(null);
    setModal('add');
  };

  const openEdit = (r: Respondent) => {
    setForm({
      emp_no: r.emp_no,
      name: r.name ?? '',
      role: r.role,
      store_code: r.store_code,
      password: '',
      is_admin: r.is_admin ?? false,
      is_owner: r.is_owner ?? false,
    });
    setFormError('');
    setEditTarget(r);
    setModal('edit');
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.emp_no.trim()) { setFormError('社員番号を入力してください'); return; }
    if (!form.store_code.trim()) { setFormError('店舗コードを入力してください'); return; }

    setSubmitting(true);
    try {
      if (modal === 'add') {
        const res = await fetch('/api/admin/respondents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emp_no: form.emp_no.trim(),
            name: form.name.trim() || undefined,
            role: form.role,
            store_code: form.store_code.trim(),
            password: form.password.trim() || undefined,
            is_admin: form.is_admin,
            is_owner: form.is_owner,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || '追加に失敗しました'); return; }
        setRespondents(prev => [...prev, data.respondent]);
        // 追加した店舗を展開
        setExpandedStores(prev => new Set([...prev, form.store_code.trim()]));
      } else if (modal === 'edit' && editTarget) {
        const res = await fetch('/api/admin/respondents', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            respondent_id: editTarget.respondent_id,
            name: form.name.trim() || undefined,
            role: form.role,
            store_code: form.store_code.trim(),
            is_admin: form.is_admin,
            is_owner: form.is_owner,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error || '更新に失敗しました'); return; }
        setRespondents(prev => prev.map(r => r.respondent_id === editTarget.respondent_id ? data.respondent : r));
      }
      setModal(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (r: Respondent) => {
    if (!confirm(`${r.name || r.emp_no} のパスワードを社員番号にリセットします。よろしいですか？`)) return;
    try {
      const res = await fetch('/api/admin/respondents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondent_id: r.respondent_id, reset_password: true }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '失敗しました'); return; }
      alert('パスワードをリセットしました');
    } catch { alert('エラーが発生しました'); }
  };

  const handleDeactivate = async (r: Respondent) => {
    const action = r.active ? '無効化' : '有効化';
    if (!confirm(`${r.name || r.emp_no} を${action}しますか？`)) return;
    try {
      if (r.active) {
        const res = await fetch(`/api/admin/respondents?id=${encodeURIComponent(r.respondent_id)}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json(); alert(d.error || '失敗しました'); return; }
        setRespondents(prev => prev.map(x => x.respondent_id === r.respondent_id ? { ...x, active: false } : x));
      } else {
        const res = await fetch('/api/admin/respondents', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ respondent_id: r.respondent_id, active: true }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || '失敗しました'); return; }
        setRespondents(prev => prev.map(x => x.respondent_id === r.respondent_id ? { ...x, active: true } : x));
      }
    } catch { alert('エラーが発生しました'); }
  };

  return (
    <div>
      {/* ページヘッダー */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-800">回答者管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">回答者の追加・編集・無効化を行います</p>
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
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">全役割</option>
            <option value="MANAGER">店長</option>
            <option value="STAFF">社員</option>
            <option value="PA">PA</option>
          </select>
          <input
            type="text"
            placeholder="店舗コード・社員番号・氏名で絞り込み"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            無効を表示
          </label>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">{filtered.length} 名 / {storeGroups.length} 店舗</span>
            <button onClick={expandAll} className="text-xs text-blue-500 hover:text-blue-700">全展開</button>
            <button onClick={collapseAll} className="text-xs text-gray-400 hover:text-gray-600">全折畳</button>
          </div>
        </div>

        {loading && <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">{error}</div>}

        {!loading && !error && (
          <>
            {storeGroups.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
                該当する回答者がいません
              </div>
            ) : (
              <div className="space-y-2">
                {storeGroups.map(({ store_code, list }) => {
                  const isExpanded = expandedStores.has(store_code);
                  const activeCount = list.filter(r => r.active).length;
                  const managerCount = list.filter(r => r.role === 'MANAGER' && r.active).length;
                  const staffCount = list.filter(r => r.role === 'STAFF' && r.active).length;
                  const paCount = list.filter(r => r.role === 'PA' && r.active).length;

                  return (
                    <div key={store_code} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* アコーディオンヘッダー */}
                      <button
                        onClick={() => toggleStore(store_code)}
                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span className="font-medium text-gray-800 text-sm">{store_code}</span>
                          <span className="text-xs text-gray-400">{activeCount}名</span>
                          <div className="flex gap-1.5">
                            {managerCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                店長 {managerCount}
                              </span>
                            )}
                            {staffCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                社員 {staffCount}
                              </span>
                            )}
                            {paCount > 0 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                                PA {paCount}
                              </span>
                            )}
                          </div>
                          {list.some(r => !r.active) && (
                            <span className="text-xs text-gray-300">（無効含む）</span>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); openAdd(store_code); }}
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
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">社員番号</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">氏名</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-400 text-xs">役割</th>
                                <th className="text-center px-4 py-2 font-medium text-gray-400 text-xs">権限</th>
                                <th className="text-center px-4 py-2 font-medium text-gray-400 text-xs">状態</th>
                                <th className="text-right px-4 py-2 font-medium text-gray-400 text-xs">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map(r => (
                                <tr
                                  key={r.respondent_id}
                                  className={`border-b border-gray-50 hover:bg-gray-50 ${!r.active ? 'opacity-50' : ''}`}
                                >
                                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.emp_no}</td>
                                  <td className="px-4 py-2.5 text-gray-800 text-sm">{r.name || <span className="text-gray-300">—</span>}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[r.role] || 'bg-gray-100 text-gray-600'}`}>
                                      {ROLE_LABELS[r.role] || r.role}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className="text-xs space-x-1">
                                      {r.is_admin && <span className="text-blue-500 font-bold">管理者</span>}
                                      {r.is_owner && <span className="text-purple-500 font-bold">Owner</span>}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`inline-block w-2 h-2 rounded-full ${r.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex justify-end gap-1">
                                      <button
                                        onClick={() => openEdit(r)}
                                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                                      >
                                        編集
                                      </button>
                                      <button
                                        onClick={() => handleResetPassword(r)}
                                        className="px-2 py-1 text-xs bg-yellow-50 hover:bg-yellow-100 rounded text-yellow-700 transition-colors"
                                      >
                                        PW
                                      </button>
                                      <button
                                        onClick={() => handleDeactivate(r)}
                                        className={`px-2 py-1 text-xs rounded transition-colors ${
                                          r.active
                                            ? 'bg-red-50 hover:bg-red-100 text-red-600'
                                            : 'bg-green-50 hover:bg-green-100 text-green-600'
                                        }`}
                                      >
                                        {r.active ? '無効化' : '有効化'}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">
                {modal === 'add' ? '回答者を追加' : '回答者を編集'}
              </h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">社員番号 *</label>
                <input
                  type="text"
                  value={form.emp_no}
                  onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))}
                  disabled={modal === 'edit'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                  placeholder="例: 10001"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">氏名</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="例: 山田 太郎"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">役割 *</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as 'MANAGER' | 'STAFF' | 'PA' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="MANAGER">店長</option>
                    <option value="STAFF">社員</option>
                    <option value="PA">PA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">店舗コード *</label>
                  <input
                    type="text"
                    value={form.store_code}
                    onChange={e => setForm(f => ({ ...f, store_code: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 1101"
                  />
                </div>
              </div>
              {modal === 'add' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    パスワード（省略時は社員番号）
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="省略すると社員番号と同じ"
                  />
                </div>
              )}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_admin}
                    onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))}
                    className="rounded"
                  />
                  管理者フラグ
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_owner}
                    onChange={e => setForm(f => ({ ...f, is_owner: e.target.checked }))}
                    className="rounded"
                  />
                  Ownerフラグ
                </label>
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
