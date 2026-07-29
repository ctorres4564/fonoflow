import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useTheme } from '../../contexts/useTheme'
import { branding } from '../../config/branding'

function AppLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Monitoramento de Conexão com a Internet (Offline/Online)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="flex min-h-screen bg-noble-50 dark:bg-noble-900 transition-colors duration-200">
      <Sidebar open={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="min-w-0 flex-1 bg-noble-50 dark:bg-noble-900 transition-colors duration-200">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-noble-200 dark:border-noble-800 bg-white/90 dark:bg-noble-900/90 px-4 py-3 backdrop-blur md:px-8 transition-colors duration-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-xl border border-noble-300 dark:border-noble-700 p-2 text-noble-700 dark:text-noble-300 hover:bg-noble-100 dark:hover:bg-noble-800 md:hidden transition-colors"
              aria-label="Abrir Menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-bold text-noble-800 dark:text-noble-100">{branding.productName}</h2>
              <p className="text-xs text-noble-500 dark:text-noble-400">Fase 1 (MVP)</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Offline/Online para atendimento Home Care */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                isOnline
                  ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-850'
                  : 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400 border border-red-250 dark:border-red-850 animate-pulse'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 rounded-xl border border-noble-300 dark:border-noble-700 bg-noble-50 dark:bg-noble-800 px-4 py-2 text-sm font-semibold text-noble-700 dark:text-noble-300 hover:bg-noble-100 dark:hover:bg-noble-800 transition"
            >
              <span>{isDark ? 'Escuro 🌙' : 'Claro ☀️'}</span>
            </button>
          </div>
        </header>

        <section className="p-4 md:p-8">
          {children || <Outlet />}
        </section>
      </main>
    </div>
  )
}

export default AppLayout
