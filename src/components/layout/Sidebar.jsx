import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/useAuth'
import { branding } from '../../config/branding'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/home-care', label: 'Home Care' },
  { to: '/auditoria', label: 'Auditoria' },
  { to: '/guia', label: 'Guia de Uso' },
]

function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    onClose?.()
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/40 transition md:hidden ${open ? 'block' : 'hidden'}`}
      />

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-72 flex-col bg-noble-800 p-6 text-white shadow-2xl transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-300">{branding.suiteName}</p>
          <h1 className="mt-2 text-2xl font-bold">{branding.productName}</h1>
          <p className="mt-2 text-sm text-noble-200">{branding.productDescription}</p>
        </div>

        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-xl px-4 py-3 text-sm font-medium transition ${
                  isActive ? 'bg-plum-600 text-white' : 'text-noble-100 hover:bg-noble-700'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="rounded-xl border border-noble-600 bg-noble-700 p-4">
          <p className="text-sm text-noble-200">Usuário conectado</p>
          <p className="mt-1 truncate text-sm font-semibold text-gold-300">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 w-full rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-noble-900 transition hover:bg-gold-300"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
