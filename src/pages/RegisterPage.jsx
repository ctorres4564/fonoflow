import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import InputField from '../components/common/InputField'
import { useAuth } from '../contexts/useAuth'
import { isValidEmail } from '../utils/validators'
import { branding } from '../config/branding'

function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = {}

    if (!form.name.trim()) nextErrors.name = 'Informe seu nome completo.'
    if (!isValidEmail(form.email)) nextErrors.email = 'Informe um e-mail válido.'
    if (!form.password || form.password.length < 6) {
      nextErrors.password = 'A senha precisa ter ao menos 6 caracteres.'
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'As senhas não coincidem.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    try {
      setLoading(true)
      await register(form.name, form.email, form.password)
      toast.success('Conta criada com sucesso!')
      navigate('/dashboard')
    } catch (error) {
      console.error(error)
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('O cadastro por E-mail/Senha não está ativado no Firebase Console! Ative-o em Authentication > Sign-in method.')
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('Este e-mail já está cadastrado em outra conta.')
      } else if (error.code === 'auth/weak-password') {
        toast.error('A senha fornecida é muito fraca.')
      } else if (error.code === 'auth/invalid-email') {
        toast.error('O formato do e-mail é inválido.')
      } else {
        toast.error(error.message || 'Não foi possível criar a conta.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-plum-100 via-white to-gold-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-plum-200 bg-white p-8 shadow-card">
        <p className="text-xs uppercase tracking-[0.3em] text-plum-600">{branding.productName}</p>
        <h1 className="mt-2 text-3xl font-bold text-noble-800">Criar conta</h1>
        <p className="mt-2 text-sm text-noble-500">Cadastre-se para começar a organizar seus atendimentos.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <InputField label="Nome completo" name="name" value={form.name} onChange={handleChange} error={errors.name} required />
          <InputField label="E-mail" name="email" type="email" value={form.email} onChange={handleChange} error={errors.email} required />
          <InputField label="Senha" name="password" type="password" value={form.password} onChange={handleChange} error={errors.password} required />
          <InputField
            label="Confirmar senha"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-plum-600 px-4 py-2.5 font-semibold text-white transition hover:bg-plum-700 disabled:opacity-60"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-5 text-sm">
          Já possui conta?{' '}
          <Link to="/login" className="font-semibold text-plum-700 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage
