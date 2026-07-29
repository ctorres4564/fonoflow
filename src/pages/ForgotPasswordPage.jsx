import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import InputField from '../components/common/InputField'
import { useAuth } from '../contexts/useAuth'
import { isValidEmail } from '../utils/validators'
import { branding } from '../config/branding'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { recoverPassword } = useAuth()

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!isValidEmail(email)) {
      setError('Informe um e-mail válido.')
      return
    }

    try {
      setLoading(true)
      setError('')
      await recoverPassword(email)
      toast.success('Enviamos o link de recuperação para seu e-mail.')
    } catch (err) {
      toast.error('Não foi possível enviar o e-mail de recuperação.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-plum-100 via-white to-gold-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-plum-200 bg-white p-8 shadow-card">
        <p className="text-xs uppercase tracking-[0.3em] text-plum-600">{branding.productName}</p>
        <h1 className="mt-2 text-3xl font-bold text-noble-800">Recuperar senha</h1>
        <p className="mt-2 text-sm text-noble-500">Digite seu e-mail para receber o link de redefinição.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <InputField
            label="E-mail"
            type="email"
            name="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error) setError('')
            }}
            error={error}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-plum-600 px-4 py-2.5 font-semibold text-white transition hover:bg-plum-700 disabled:opacity-60"
          >
            {loading ? 'Enviando...' : 'Enviar recuperação'}
          </button>
        </form>

        <p className="mt-5 text-sm">
          Lembrou sua senha?{' '}
          <Link to="/login" className="font-semibold text-plum-700 hover:underline">
            Voltar para login
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
