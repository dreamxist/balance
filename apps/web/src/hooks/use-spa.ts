import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import {
  getSpaDashboard, getSpaInvoices, getSpaExpenses, getSpaProfit,
  getSpaEmitidas, getSpaRecibidas, createSpaInvoiceV2, markSpaInvoicePaid,
  getF29Summary, getSpaAnnualSummary,
  uploadFacturaFile, getSpaReimbursables, linkTransactionToInvoice, markF29Declared,
} from '@balance/core'
import type { SpaDashboardData, SpaInvoice, SpaInvoiceRow, F29Summary, AnnualSummary, CreateInvoiceInput, ReimbursableRow, MarkF29DeclaredInput } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type TransactionRow = Awaited<ReturnType<typeof getSpaExpenses>>[number]

export type { TransactionRow as SpaExpense }

export function useSpaDashboard(): UseQueryResult<SpaDashboardData> {
  return useQuery({
    queryKey: ['spa', 'dashboard'],
    queryFn: () => getSpaDashboard(supabase),
    staleTime: 30_000,
  })
}

export function useSpaInvoices(): UseQueryResult<SpaInvoice[]> {
  return useQuery({
    queryKey: ['spa', 'invoices'],
    queryFn: () => getSpaInvoices(supabase),
    staleTime: 30_000,
  })
}

export function useSpaExpenses(): UseQueryResult<TransactionRow[]> {
  return useQuery({
    queryKey: ['spa', 'expenses'],
    queryFn: () => getSpaExpenses(supabase),
    staleTime: 30_000,
  })
}

export function useSpaProfit(year?: number): UseQueryResult<{ profit: number; year: number }> {
  return useQuery({
    queryKey: ['spa', 'profit', year ?? new Date().getFullYear()],
    queryFn: () => getSpaProfit(supabase, year),
    staleTime: 30_000,
  })
}

// === V2: Facturas + F29 ===

export function useSpaEmitidas(month?: string): UseQueryResult<SpaInvoiceRow[]> {
  return useQuery({
    queryKey: ['spa', 'emitidas', month],
    queryFn: () => getSpaEmitidas(supabase, month),
    staleTime: 30_000,
  })
}

export function useSpaRecibidas(month?: string): UseQueryResult<SpaInvoiceRow[]> {
  return useQuery({
    queryKey: ['spa', 'recibidas', month],
    queryFn: () => getSpaRecibidas(supabase, month),
    staleTime: 30_000,
  })
}

export function useF29Summary(year: number, month: number): UseQueryResult<F29Summary> {
  return useQuery({
    queryKey: ['spa', 'f29', year, month],
    queryFn: () => getF29Summary(supabase, year, month),
    staleTime: 30_000,
  })
}

export function useSpaAnnualSummary(year: number): UseQueryResult<AnnualSummary> {
  return useQuery({
    queryKey: ['spa', 'annual', year],
    queryFn: () => getSpaAnnualSummary(supabase, year),
    staleTime: 60_000,
  })
}

export function useCreateSpaInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => createSpaInvoiceV2(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spa'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Factura registrada')
    },
    onError: () => toast.error('Error al registrar factura'),
  })
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, accountId }: { invoiceId: string; accountId: string }) =>
      markSpaInvoicePaid(supabase, invoiceId, accountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spa'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Factura marcada como pagada')
    },
    onError: () => toast.error('Error al marcar factura'),
  })
}

export function useUploadFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, file }: { invoiceId: string; file: File }) =>
      uploadFacturaFile(supabase, invoiceId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spa'] })
      toast.success('Factura subida')
    },
    onError: () => toast.error('Error al subir factura'),
  })
}

export function useSpaReimbursables() {
  return useQuery({
    queryKey: ['spa', 'reimbursables'],
    queryFn: () => getSpaReimbursables(supabase),
    staleTime: 30_000,
  }) as UseQueryResult<ReimbursableRow[]>
}

interface LinkInvoiceInput {
  transactionId: string
  invoiceId: string
  reimbursable?: boolean
}

export function useLinkTransactionToInvoice() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, LinkInvoiceInput>({
    mutationFn: ({ transactionId, invoiceId, reimbursable }) =>
      linkTransactionToInvoice(supabase, transactionId, invoiceId, reimbursable),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spa'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast.success('Gasto vinculado a factura')
    },
    onError: () => toast.error('Error al vincular gasto'),
  })
}

export function useMarkF29Declared() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, MarkF29DeclaredInput>({
    mutationFn: (input) => markF29Declared(supabase, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spa'] })
      toast.success('F29 marcado como declarado')
    },
    onError: () => toast.error('Error al marcar F29'),
  })
}
