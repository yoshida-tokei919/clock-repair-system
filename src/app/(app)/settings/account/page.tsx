'use client'

import { FormEvent, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AccountSettingsPage() {
  const { data: session } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmation) {
      setError('新しいパスワードが一致していません。')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setError(result?.error || 'パスワードを変更できませんでした。')
        return
      }
      await signOut({ callbackUrl: '/login' })
    } catch {
      setError('パスワードを変更できませんでした。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>アカウント設定</CardTitle>
          <p className="text-sm text-slate-500">ログイン中: {session?.user?.email || '確認中...'}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">現在のパスワード</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新しいパスワード</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)} minLength={12} required />
              <p className="text-xs text-slate-500">12文字以上。UTF-8で72バイト以下にしてください。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation">新しいパスワード（確認）</Label>
              <Input id="confirmation" type="password" autoComplete="new-password" value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)} minLength={12} required />
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? '変更中...' : 'パスワードを変更'}</Button>
            <p className="text-xs text-slate-500">変更後はこの端末をログアウトし、新しいパスワードで再ログインします。</p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
