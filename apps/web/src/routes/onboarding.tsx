import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { completeOnboarding, getOnboardingStatus } from '@balance/core'
import type { OnboardingAccount } from '@balance/core'
import { StepMoney } from '@/components/onboarding/step-money'
import { StepDebts } from '@/components/onboarding/step-debts'
import { StepProfile } from '@/components/onboarding/step-profile'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

const STEPS = ['Dinero', 'Deudas', 'Perfil'] as const

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState<OnboardingAccount[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      void navigate({ to: '/login' })
      return
    }
    getOnboardingStatus(supabase)
      .then(({ isOnboarded }) => {
        if (isOnboarded) {
          void navigate({ to: '/' })
        } else {
          setCheckingStatus(false)
        }
      })
      .catch(() => {
        setCheckingStatus(false)
      })
  }, [user, authLoading, navigate])

  async function handleSubmit(profile?: { displayName?: string; features?: Record<string, boolean> }) {
    setSubmitting(true)
    setError(null)
    try {
      await completeOnboarding(supabase, {
        accounts,
        profile,
      })
      void navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al completar onboarding')
      setSubmitting(false)
    }
  }

  if (authLoading || checkingStatus) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Balance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configura tu cuenta</p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((name, i) => (
            <div key={name} className="flex items-center gap-2">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  i < step
                    ? 'bg-balanced text-white'
                    : i === step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {i < step ? (
                  <svg className="size-4" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 4.5L6.5 11.5L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-8 ${i < step ? 'bg-balanced' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step === 0 && (
            <StepMoney
              onNext={(moneyAccounts) => {
                setAccounts(moneyAccounts)
                setStep(1)
              }}
            />
          )}

          {step === 1 && (
            <StepDebts
              onNext={(debtAccounts) => {
                setAccounts((prev) => [...prev, ...debtAccounts])
                setStep(2)
              }}
              onSkip={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <StepProfile
              onComplete={(profile) => void handleSubmit(profile)}
              onSkip={() => void handleSubmit()}
            />
          )}

          {submitting && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Creando tus cuentas...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
