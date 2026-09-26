import Sidebar from '@/components/layout/Sidebar'
import { WorkTimerProvider } from '@/components/work-time/WorkTimerProvider'
import { WorkTimerBar } from '@/components/work-time/WorkTimerBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <WorkTimerProvider>
        <Sidebar />
        <WorkTimerBar />
        <main className="flex-1">
          {children}
        </main>
      </WorkTimerProvider>
    </div>
  )
}
