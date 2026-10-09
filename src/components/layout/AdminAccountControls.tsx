'use client'

import { signOut } from 'next-auth/react'

export default function AdminAccountControls({ email }: { email: string }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-gray-700 pl-3">
      <span className="hidden max-w-52 truncate text-xs text-gray-300 xl:inline" title={email}>{email}</span>
      <button type="button" onClick={() => signOut({ callbackUrl: '/login' })}
        className="whitespace-nowrap rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 transition-colors hover:bg-gray-800">
        ログアウト
      </button>
    </div>
  )
}
