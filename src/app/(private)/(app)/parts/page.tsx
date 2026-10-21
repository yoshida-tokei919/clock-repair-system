'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PartsSearchPanel from '@/components/parts/PartsSearchPanel'

export default function PartsPage() {
  const router = useRouter()
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">部品マスタ</h1>
        <button
          onClick={() => router.push('/parts/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold"
        >
          ＋ 新規登録
        </button>
      </div>
      <PartsSearchPanel mode="standalone" />
    </div>
  )
}
