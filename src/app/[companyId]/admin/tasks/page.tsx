'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AiTask } from '@/lib/types';

export default function AdminTasksPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/tasks')
      .then(res => {
        if (res.status === 401) { router.push(`/${companyId}`); return null; }
        if (!res.ok) throw new Error('Failed to load tasks');
        return res.json();
      })
      .then(data => { if (data) setTasks(data); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [companyId, router]);

  const toggleStatus = async (task: AiTask) => {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    setUpdating(task.id);
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: newStatus }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラー');
    } finally {
      setUpdating(null);
    }
  };

  const pending = tasks.filter(t => t.status === 'pending');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => router.push(`/${companyId}/admin/summary`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← サマリーに戻る
          </button>
          <h1 className="text-base font-bold text-gray-800">アクションタスク管理</h1>
          <span className="ml-auto text-xs text-gray-400">AIが提案したアクションをタスクとして管理します</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-gray-400 text-sm">タスクはまだありません。</p>
            <p className="text-gray-400 text-xs mt-1">サマリーページでAI分析を実行し、アクションにチェックして登録してください。</p>
          </div>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>
              未完了 ({pending.length})
            </h2>
            <ul className="space-y-2">
              {pending.map(task => (
                <TaskItem key={task.id} task={task} updating={updating} onToggle={toggleStatus} />
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-500 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
              完了済み ({done.length})
            </h2>
            <ul className="space-y-2 opacity-60">
              {done.map(task => (
                <TaskItem key={task.id} task={task} updating={updating} onToggle={toggleStatus} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function TaskItem({
  task,
  updating,
  onToggle,
}: {
  task: AiTask;
  updating: string | null;
  onToggle: (task: AiTask) => void;
}) {
  const isDone = task.status === 'done';
  const isUpdating = updating === task.id;

  return (
    <li className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3 hover:border-gray-300 transition-colors">
      <button
        onClick={() => onToggle(task)}
        disabled={isUpdating}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isDone
            ? 'bg-teal-500 border-teal-500 text-white'
            : 'border-gray-300 hover:border-teal-400'
        } disabled:opacity-50`}
        aria-label={isDone ? '未完了に戻す' : '完了にする'}
      >
        {isDone && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.text}
        </p>
        <div className="flex gap-3 mt-1">
          <span className="text-xs text-gray-400">対象期間: {task.survey_id || '-'}</span>
          <span className="text-xs text-gray-400">登録: {new Date(task.created_at).toLocaleDateString('ja-JP')}</span>
        </div>
      </div>
    </li>
  );
}
