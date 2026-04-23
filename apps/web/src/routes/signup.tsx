import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const { user, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  if (user) {
    void navigate({ to: '/onboarding' as string })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await signUp({ email, password })
      if (result.confirmEmail) {
        setConfirmEmail(true)
      } else {
        void navigate({ to: '/onboarding' as string })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cuenta')
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmEmail) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Balance</h1>
          <div className="rounded-md border border-border bg-card p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              Te enviamos un email de confirmacion a <strong className="text-foreground">{email}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Revisa tu bandeja de entrada y confirma tu cuenta para continuar.
            </p>
          </div>
          <Link to="/login" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground/80">
            Volver al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Balance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crea tu cuenta</p>
        </div>

        <div className="rounded-md border border-border bg-card p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
                placeholder="tu@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-2 focus:ring-ring/20 focus:outline-none"
                placeholder="********"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Ya tienes cuenta?{' '}
          <Link to="/login" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
            Iniciar sesion
          </Link>
        </p>
      </div>
    </div>
  )
}
