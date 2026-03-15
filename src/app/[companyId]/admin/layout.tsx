'use client';

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV_ITEMS = [
  { label: 'ダッシュボード', path: '' },
  { label: '回答進捗', path: '/progress' },
  { label: '回答者管理', path: '/respondents' },
  { label: '組織ユニット', path: '/org-units' },
  { label: 'サーベイ期', path: '/surveys' },
  { label: 'タスク', path: '/tasks' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = params.companyId as string;
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 管理画面ナビゲーション */}
      <nav className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            <span className="text-xs font-bold text-gray-400 mr-2 whitespace-nowrap py-3 flex-shrink-0">
              管理
            </span>
            {NAV_ITEMS.map((item) => {
              const href = `/${companyId}/admin${item.path}`;
              const isActive = item.path === ''
                ? pathname === `/${companyId}/admin` || pathname === `/${companyId}/admin/`
                : pathname.startsWith(href);
              return (
                <Link
                  key={item.path}
                  href={href}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
