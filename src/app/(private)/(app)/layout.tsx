import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import { AdminPageArtwork } from '@/components/layout/AdminPageArtwork'
import { WorkTimerProvider } from '@/components/work-time/WorkTimerProvider'
import { WorkTimerBar } from '@/components/work-time/WorkTimerBar'
import { ScanSessionProvider } from '@/components/scan/ScanSessionProvider'
import { ScanReceiverBar } from '@/components/scan/ScanReceiverBar'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) redirect('/login?reauth=1')

  const admin = await prisma.admin.findUnique({ where: { email }, select: { email: true, role: true } })
  if (!admin || admin.role !== 'admin') redirect('/login?reauth=1')

  return (
    <div className="flex flex-col min-h-screen">
      <WorkTimerProvider adminEmail={admin.email}>
        <ScanSessionProvider>
          <Sidebar adminEmail={admin.email} />
          <ScanReceiverBar />
          <div className="flex min-h-0 min-w-0 flex-1">
            <main className="min-w-0 flex-1">
              <AdminPageArtwork>{children}</AdminPageArtwork>
            </main>
            <WorkTimerBar />
          </div>
        </ScanSessionProvider>
      </WorkTimerProvider>
    </div>
  )
}
