'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin', label: 'ダッシュボード', icon: '🏠' },
  { href: '/repairs', label: '修理一覧', icon: '🔧' },
  { href: '/repairs/board', label: 'ボード表示', icon: '📋' },
  { href: '/repairs/new', label: '新規修理登録', icon: '➕' },
  { href: '/parts', label: '部品マスタ', icon: '⚙️' },
  { href: '/orders', label: '発注管理', icon: '📦' },
  { href: '/masters/pricing', label: '料金マスタ', icon: '💴' },
  { href: '/invoices', label: '請求書管理', icon: '📄' },
  { href: '/customers', label: '顧客管理', icon: '👤' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <header className="h-12 bg-gray-900 text-white flex items-center px-4 gap-1 sticky top-0 z-40">
      <span className="text-sm font-bold text-gray-300 whitespace-nowrap mr-3">
        ヨシダ時計修理工房
      </span>
      <nav className="flex items-center gap-1 overflow-x-auto">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors whitespace-nowrap
              ${pathname === item.href || pathname.startsWith(item.href + '/')
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'}`}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </header>
  )
}
