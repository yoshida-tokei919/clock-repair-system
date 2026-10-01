import Sidebar from '@/components/layout/Sidebar'
import { WorkTimerProvider } from '@/components/work-time/WorkTimerProvider'
import { WorkTimerBar } from '@/components/work-time/WorkTimerBar'
import { ScanSessionProvider } from '@/components/scan/ScanSessionProvider'
import { ScanReceiverBar } from '@/components/scan/ScanReceiverBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <WorkTimerProvider>
        <ScanSessionProvider>
          <Sidebar />
          <WorkTimerBar />
          <ScanReceiverBar />
          <main className="flex-1">
            {children}
          </main>
        </ScanSessionProvider>
      </WorkTimerProvider>
    </div>
  )
}
