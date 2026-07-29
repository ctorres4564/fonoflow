import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import InputField from '../components/common/InputField'
import { useAuth } from '../contexts/useAuth'
import { isValidEmail } from '../utils/validators'
import { branding } from '../config/branding'

function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = {}

    if (!isValidEmail(form.email)) nextErrors.email = 'Informe um e-mail válido.'
    if (!form.password || form.password.length < 6) {
      nextErrors.password = 'A senha precisa ter ao menos 6 caracteres.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    try {
      setLoading(true)
      await login(form.email, form.password)
      toast.success('Login realizado com sucesso!')
      navigate('/dashboard')
    } catch (error) {
      console.error(error)
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        toast.error('E-mail ou senha incorretos.')
      } else if (error.code === 'auth/operation-not-allowed') {
        toast.error('O provedor de login E-mail/Senha não está ativo no Firebase.')
      } else {
        toast.error(error.message || 'Falha ao realizar login.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-plum-100 via-white to-gold-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-plum-200 bg-white p-8 shadow-card">
        <p className="text-xs uppercase tracking-[0.3em] text-plum-600">{branding.productName}</p>
        <h1 className="mt-2 text-3xl font-bold text-noble-800">Entrar</h1>
        <p className="mt-2 text-sm text-noble-500">Acesse a plataforma para gerenciar seus pacientes.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <InputField
            label="E-mail"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            error={errors.email}
            placeholder="seuemail@clinica.com"
            required
          />
          <InputField
            label="Senha"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            error={errors.password}
            placeholder="********"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-plum-600 px-4 py-2.5 font-semibold text-white transition hover:bg-plum-700 disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-sm">
          <p>
            Não possui conta?{' '}
            <Link to="/cadastro" className="font-semibold text-plum-700 hover:underline">
              Criar agora
            </Link>
          </p>
          <Link to="/recuperar-senha" className="font-semibold text-gold-600 hover:underline">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
