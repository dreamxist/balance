import { useState } from 'react'
import { exportAllData, exportTableAsCsv, downloadBlob } from '@balance/core'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ExportSection() {
  const [loadingJson, setLoadingJson] = useState(false)
  const [loadingTx, setLoadingTx] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  async function handleExportJson() {
    setLoadingJson(true)
    try {
      const data = await exportAllData(supabase)
      downloadBlob(JSON.stringify(data, null, 2), `balance-export-${todayString()}.json`, 'application/json')
      toast.success('Export JSON descargado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setLoadingJson(false)
    }
  }

  async function handleExportTransactions() {
    setLoadingTx(true)
    try {
      const data = await exportAllData(supabase)
      const csv = exportTableAsCsv(data.tables.transactions, 'transactions')
      if (!csv) {
        toast.error('No hay transacciones para exportar')
        return
      }
      downloadBlob(csv, `transacciones-${todayString()}.csv`, 'text/csv')
      toast.success('CSV de transacciones descargado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setLoadingTx(false)
    }
  }

  async function handleExportAccounts() {
    setLoadingAccounts(true)
    try {
      const data = await exportAllData(supabase)
      const csv = exportTableAsCsv(data.tables.accounts, 'accounts')
      if (!csv) {
        toast.error('No hay cuentas para exportar')
        return
      }
      downloadBlob(csv, `cuentas-${todayString()}.csv`, 'text/csv')
      toast.success('CSV de cuentas descargado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al exportar')
    } finally {
      setLoadingAccounts(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-semibold">Exportar Datos</h2>
        <p className="text-xs text-muted-foreground">Descarga tus datos financieros</p>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <button
          type="button"
          onClick={handleExportJson}
          disabled={loadingJson}
          className="flex flex-col items-start gap-1 rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <span className="text-lg">{ '{}'  }</span>
          <span className="text-sm font-medium">{loadingJson ? 'Exportando...' : 'Exportar todo (JSON)'}</span>
          <span className="text-xs text-muted-foreground">Todas las tablas en un archivo</span>
        </button>

        <button
          type="button"
          onClick={handleExportTransactions}
          disabled={loadingTx}
          className="flex flex-col items-start gap-1 rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <span className="text-lg">&darr;</span>
          <span className="text-sm font-medium">{loadingTx ? 'Exportando...' : 'Transacciones (CSV)'}</span>
          <span className="text-xs text-muted-foreground">Historial de movimientos</span>
        </button>

        <button
          type="button"
          onClick={handleExportAccounts}
          disabled={loadingAccounts}
          className="flex flex-col items-start gap-1 rounded-md border border-border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <span className="text-lg">&darr;</span>
          <span className="text-sm font-medium">{loadingAccounts ? 'Exportando...' : 'Cuentas (CSV)'}</span>
          <span className="text-xs text-muted-foreground">Lista de cuentas y saldos</span>
        </button>
      </div>
    </div>
  )
}
