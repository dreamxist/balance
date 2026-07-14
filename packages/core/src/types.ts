export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          credit_limit?: number | null
          currency?: string
          entity?: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_archived?: boolean
          metadata?: Json | null
          name: string
          on_budget?: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          credit_limit?: number | null
          currency?: string
          entity?: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_archived?: boolean
          metadata?: Json | null
          name?: string
          on_budget?: boolean
          subtype?: Database["public"]["Enums"]["account_subtype"]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          created_at: string
          id: number
          new_row: Json | null
          old_row: Json | null
          operation: string
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation: string
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          new_row?: Json | null
          old_row?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string | null
        }
        Insert: {
          entity?: Database["public"]["Enums"]["entity_type"]
          id: string
          name: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          entity?: Database["public"]["Enums"]["entity_type"]
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          category: string
          created_at: string
          id: string
          pattern: string
          priority: number
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          pattern: string
          priority?: number
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          pattern?: string
          priority?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          account_id: string
          category: string | null
          created_at: string
          description: string
          first_payment_date: string | null
          id: string
          installment_amount: number
          installments: number
          installments_paid: number
          last_installment_amount: number
          next_payment_date: string | null
          remaining_amount: number
          start_date: string
          status: Database["public"]["Enums"]["debt_status"]
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          category?: string | null
          created_at?: string
          description: string
          first_payment_date?: string | null
          id?: string
          installment_amount: number
          installments: number
          installments_paid?: number
          last_installment_amount: number
          next_payment_date?: string | null
          remaining_amount: number
          start_date?: string
          status?: Database["public"]["Enums"]["debt_status"]
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          category?: string | null
          created_at?: string
          description?: string
          first_payment_date?: string | null
          id?: string
          installment_amount?: number
          installments?: number
          installments_paid?: number
          last_installment_amount?: number
          next_payment_date?: string | null
          remaining_amount?: number
          start_date?: string
          status?: Database["public"]["Enums"]["debt_status"]
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
        ]
      }
      email_movements: {
        Row: {
          account_hint: string | null
          amount: number | null
          bank_tx_id: string | null
          counterparty: string | null
          created_at: string
          currency: string | null
          dest_hint: string | null
          email_date: string | null
          error_detail: string | null
          gmail_message_id: string
          id: string
          merchant: string | null
          raw_snippet: string | null
          source: string
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          account_hint?: string | null
          amount?: number | null
          bank_tx_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string | null
          dest_hint?: string | null
          email_date?: string | null
          error_detail?: string | null
          gmail_message_id: string
          id?: string
          merchant?: string | null
          raw_snippet?: string | null
          source: string
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          account_hint?: string | null
          amount?: number | null
          bank_tx_id?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string | null
          dest_hint?: string | null
          email_date?: string | null
          error_detail?: string | null
          gmail_message_id?: string
          id?: string
          merchant?: string | null
          raw_snippet?: string | null
          source?: string
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "spa_reimbursables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      error_log: {
        Row: {
          context: Json | null
          created_at: string
          error_detail: string | null
          error_message: string
          function_name: string
          id: number
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_detail?: string | null
          error_message: string
          function_name: string
          id?: never
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_detail?: string | null
          error_message?: string
          function_name?: string
          id?: never
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_onboarded: boolean
          name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id: string
          is_onboarded?: boolean
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_onboarded?: boolean
          name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recurring_charges: {
        Row: {
          account_id: string
          amount: number
          auto_charge: boolean
          category: string
          created_at: string
          currency: string
          day_of_month: number
          id: string
          is_active: boolean
          last_charged_on: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          auto_charge?: boolean
          category: string
          created_at?: string
          currency?: string
          day_of_month: number
          id?: string
          is_active?: boolean
          last_charged_on?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          auto_charge?: boolean
          category?: string
          created_at?: string
          currency?: string
          day_of_month?: number
          id?: string
          is_active?: boolean
          last_charged_on?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_charges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_charges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          accumulated: number
          created_at: string
          date: string
          delta: number
          entries: Json
          id: string
          net_worth: number
          position: number
          status: Database["public"]["Enums"]["snapshot_status"]
          total_assets: number
          total_liabilities: number
          user_id: string
        }
        Insert: {
          accumulated: number
          created_at?: string
          date: string
          delta: number
          entries: Json
          id?: string
          net_worth: number
          position: number
          status: Database["public"]["Enums"]["snapshot_status"]
          total_assets: number
          total_liabilities: number
          user_id: string
        }
        Update: {
          accumulated?: number
          created_at?: string
          date?: string
          delta?: number
          entries?: Json
          id?: string
          net_worth?: number
          position?: number
          status?: Database["public"]["Enums"]["snapshot_status"]
          total_assets?: number
          total_liabilities?: number
          user_id?: string
        }
        Relationships: []
      }
      spa_f29_declarations: {
        Row: {
          confirmation_number: string | null
          created_at: string
          declared_at: string
          f29_total: number
          id: string
          is_official: boolean
          iva_credito: number
          iva_debito: number
          iva_neto: number
          month: number
          notes: string | null
          official_codes: Json | null
          ppm: number
          remanente_anterior: number
          remanente_siguiente: number
          user_id: string
          year: number
        }
        Insert: {
          confirmation_number?: string | null
          created_at?: string
          declared_at: string
          f29_total: number
          id?: string
          is_official?: boolean
          iva_credito: number
          iva_debito: number
          iva_neto: number
          month: number
          notes?: string | null
          official_codes?: Json | null
          ppm: number
          remanente_anterior?: number
          remanente_siguiente?: number
          user_id: string
          year: number
        }
        Update: {
          confirmation_number?: string | null
          created_at?: string
          declared_at?: string
          f29_total?: number
          id?: string
          is_official?: boolean
          iva_credito?: number
          iva_debito?: number
          iva_neto?: number
          month?: number
          notes?: string | null
          official_codes?: Json | null
          ppm?: number
          remanente_anterior?: number
          remanente_siguiente?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      spa_invoices: {
        Row: {
          counterpart: string
          created_at: string
          date: string
          description: string
          direction: Database["public"]["Enums"]["invoice_direction"]
          doc_type: Database["public"]["Enums"]["document_type"]
          factura_url: string | null
          folio_sii: string | null
          id: string
          in_rcv: boolean
          iva: number
          neto: number
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          counterpart: string
          created_at?: string
          date?: string
          description?: string
          direction: Database["public"]["Enums"]["invoice_direction"]
          doc_type?: Database["public"]["Enums"]["document_type"]
          factura_url?: string | null
          folio_sii?: string | null
          id?: string
          in_rcv?: boolean
          iva: number
          neto: number
          status?: Database["public"]["Enums"]["invoice_status"]
          total: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          counterpart?: string
          created_at?: string
          date?: string
          description?: string
          direction?: Database["public"]["Enums"]["invoice_direction"]
          doc_type?: Database["public"]["Enums"]["document_type"]
          factura_url?: string | null
          folio_sii?: string | null
          id?: string
          in_rcv?: boolean
          iva?: number
          neto?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          total?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spa_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "spa_reimbursables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spa_invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          gmail_watermark: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          gmail_watermark?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          gmail_watermark?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          date: string
          debt_id: string | null
          description: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          linked_invoice_id: string | null
          metadata: Json | null
          reimbursable: boolean
          transfer_to: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          created_at?: string
          date?: string
          debt_id?: string | null
          description: string
          entity?: Database["public"]["Enums"]["entity_type"]
          id?: string
          linked_invoice_id?: string | null
          metadata?: Json | null
          reimbursable?: boolean
          transfer_to?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          created_at?: string
          date?: string
          debt_id?: string | null
          description?: string
          entity?: Database["public"]["Enums"]["entity_type"]
          id?: string
          linked_invoice_id?: string | null
          metadata?: Json | null
          reimbursable?: boolean
          transfer_to?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_debt"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "active_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_debt"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_transfer_to"
            columns: ["transfer_to"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_transactions_transfer_to"
            columns: ["transfer_to"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "spa_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_debts: {
        Row: {
          account_id: string | null
          account_name: string | null
          category: string | null
          created_at: string | null
          description: string | null
          first_payment_date: string | null
          id: string | null
          installment_amount: number | null
          installments: number | null
          installments_paid: number | null
          last_installment_amount: number | null
          next_payment_date: string | null
          remaining_amount: number | null
          remaining_installments: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["debt_status"] | null
          total_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_status: {
        Row: {
          available: number | null
          credit_limit: number | null
          future_installments: number | null
          id: string | null
          name: string | null
          statement_balance: number | null
          total_used: number | null
        }
        Relationships: []
      }
      monthly_summary: {
        Row: {
          category: string | null
          entity: Database["public"]["Enums"]["entity_type"] | null
          expenses: number | null
          income: number | null
          month: string | null
          net: number | null
          tx_count: number | null
          type: Database["public"]["Enums"]["transaction_type"] | null
        }
        Relationships: []
      }
      reconciliation_status: {
        Row: {
          accumulated: number | null
          delta: number | null
          position: number | null
        }
        Relationships: []
      }
      recurring_charges_detailed: {
        Row: {
          account_id: string | null
          account_name: string | null
          amount: number | null
          auto_charge: boolean | null
          category: string | null
          created_at: string | null
          currency: string | null
          day_of_month: number | null
          entity: Database["public"]["Enums"]["entity_type"] | null
          id: string | null
          is_active: boolean | null
          last_charged_on: string | null
          name: string | null
          subtype: Database["public"]["Enums"]["account_subtype"] | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_charges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_charges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
        ]
      }
      spa_reimbursables: {
        Row: {
          account_id: string | null
          account_name: string | null
          amount: number | null
          category: string | null
          date: string | null
          description: string | null
          id: string | null
          invoice_counterpart: string | null
          invoice_total: number | null
          linked_invoice_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "spa_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _advance_debt_payment: {
        Args: { p_debt_id: string }
        Returns: {
          account_id: string
          category: string | null
          created_at: string
          description: string
          first_payment_date: string | null
          id: string
          installment_amount: number
          installments: number
          installments_paid: number
          last_installment_amount: number
          next_payment_date: string | null
          remaining_amount: number
          start_date: string
          status: Database["public"]["Enums"]["debt_status"]
          total_amount: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "debts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _apply_recurring_charge: {
        Args: {
          p_amount?: number
          p_charge: Database["public"]["Tables"]["recurring_charges"]["Row"]
          p_date: string
        }
        Returns: Json
      }
      _bucket_root: { Args: { p_category: string }; Returns: string }
      _create_debt: {
        Args: {
          p_account_id: string
          p_category: string
          p_description: string
          p_first_payment_date?: string
          p_installments: number
          p_start_date: string
          p_total: number
          p_user_id: string
        }
        Returns: {
          account_id: string
          category: string | null
          created_at: string
          description: string
          first_payment_date: string | null
          id: string
          installment_amount: number
          installments: number
          installments_paid: number
          last_installment_amount: number
          next_payment_date: string | null
          remaining_amount: number
          start_date: string
          status: Database["public"]["Enums"]["debt_status"]
          total_amount: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "debts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _insert_transaction: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category: string
          p_date: string
          p_debt_id?: string
          p_description: string
          p_entity: Database["public"]["Enums"]["entity_type"]
          p_transfer_to?: string
          p_type: Database["public"]["Enums"]["transaction_type"]
          p_user_id: string
        }
        Returns: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          date: string
          debt_id: string | null
          description: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          linked_invoice_id: string | null
          metadata: Json | null
          reimbursable: boolean
          transfer_to: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _match_account_by_hint: {
        Args: { p_currency?: string; p_hint: string; p_user_id: string }
        Returns: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _update_account_balance: {
        Args: { p_account_id: string; p_delta: number }
        Returns: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_account: {
        Args: { p_account_id: string }
        Returns: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_debt: { Args: { p_debt_id: string }; Returns: Json }
      complete_onboarding: { Args: { p_data: Json }; Returns: Json }
      create_account: {
        Args: {
          p_balance?: number
          p_credit_limit?: number
          p_currency?: string
          p_entity?: Database["public"]["Enums"]["entity_type"]
          p_name: string
          p_on_budget?: boolean
          p_subtype: Database["public"]["Enums"]["account_subtype"]
          p_type: Database["public"]["Enums"]["account_type"]
        }
        Returns: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_installment_purchase: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category: string
          p_date?: string
          p_description: string
          p_first_payment_date?: string
          p_installments: number
        }
        Returns: Json
      }
      create_inter_entity_transfer: {
        Args: {
          p_amount: number
          p_date?: string
          p_description: string
          p_from_account_id: string
          p_to_account_id: string
        }
        Returns: Json
      }
      create_opening_balance: {
        Args: { p_account_id: string }
        Returns: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          date: string
          debt_id: string | null
          description: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          linked_invoice_id: string | null
          metadata: Json | null
          reimbursable: boolean
          transfer_to: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_snapshot: { Args: { p_date?: string }; Returns: Json }
      create_spa_invoice: {
        Args: {
          p_account_id?: string
          p_counterpart: string
          p_create_transaction?: boolean
          p_date?: string
          p_description?: string
          p_direction: Database["public"]["Enums"]["invoice_direction"]
          p_doc_type?: Database["public"]["Enums"]["document_type"]
          p_folio_sii?: string
          p_neto: number
        }
        Returns: {
          counterpart: string
          created_at: string
          date: string
          description: string
          direction: Database["public"]["Enums"]["invoice_direction"]
          doc_type: Database["public"]["Enums"]["document_type"]
          factura_url: string | null
          folio_sii: string | null
          id: string
          in_rcv: boolean
          iva: number
          neto: number
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          transaction_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "spa_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_subcategory: {
        Args: { p_id: string; p_name: string; p_parent_id: string }
        Returns: {
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transaction: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category: string
          p_date?: string
          p_description: string
          p_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: Json
      }
      create_transfer: {
        Args: {
          p_amount: number
          p_date?: string
          p_description: string
          p_from_account_id: string
          p_to_account_id: string
        }
        Returns: Json
      }
      delete_category: { Args: { p_category_id: string }; Returns: undefined }
      get_f29_summary: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_monthly_buckets: {
        Args: {
          p_entity?: Database["public"]["Enums"]["entity_type"]
          p_month?: string
        }
        Returns: Json
      }
      get_reconciliation_status: {
        Args: { p_entity?: Database["public"]["Enums"]["entity_type"] }
        Returns: Json
      }
      get_recurring_status: {
        Args: {
          p_as_of?: string
          p_entity?: Database["public"]["Enums"]["entity_type"]
        }
        Returns: Json
      }
      get_snapshot_history: {
        Args: { p_limit?: number }
        Returns: {
          accumulated: number
          created_at: string
          date: string
          delta: number
          entries: Json
          id: string
          net_worth: number
          position: number
          status: Database["public"]["Enums"]["snapshot_status"]
          total_assets: number
          total_liabilities: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_spa_annual_summary: { Args: { p_year: number }; Returns: Json }
      link_transaction_to_invoice: {
        Args: {
          p_invoice_id: string
          p_reimbursable?: boolean
          p_transaction_id: string
        }
        Returns: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          date: string
          debt_id: string | null
          description: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          linked_invoice_id: string | null
          metadata: Json | null
          reimbursable: boolean
          transfer_to: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_f29_declared: {
        Args: {
          p_confirmation_number?: string
          p_declared_at?: string
          p_month: number
          p_notes?: string
          p_official_codes?: Json
          p_year: number
        }
        Returns: {
          confirmation_number: string | null
          created_at: string
          declared_at: string
          f29_total: number
          id: string
          is_official: boolean
          iva_credito: number
          iva_debito: number
          iva_neto: number
          month: number
          notes: string | null
          official_codes: Json | null
          ppm: number
          remanente_anterior: number
          remanente_siguiente: number
          user_id: string
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "spa_f29_declarations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_invoice_paid: {
        Args: { p_account_id: string; p_invoice_id: string }
        Returns: {
          counterpart: string
          created_at: string
          date: string
          description: string
          direction: Database["public"]["Enums"]["invoice_direction"]
          doc_type: Database["public"]["Enums"]["document_type"]
          factura_url: string | null
          folio_sii: string | null
          id: string
          in_rcv: boolean
          iva: number
          neto: number
          status: Database["public"]["Enums"]["invoice_status"]
          total: number
          transaction_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "spa_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_debt_installment: {
        Args: { p_date?: string; p_debt_id: string }
        Returns: Json
      }
      pay_off_debt: {
        Args: { p_actual_amount?: number; p_debt_id: string }
        Returns: Json
      }
      pay_recurring_charge: {
        Args: { p_amount?: number; p_charge_id: string; p_date?: string }
        Returns: Json
      }
      process_due_recurring_charges: {
        Args: {
          p_as_of?: string
          p_dry_run?: boolean
          p_entity?: Database["public"]["Enums"]["entity_type"]
          p_include_manual?: boolean
          p_user_id?: string
        }
        Returns: Json
      }
      promote_email_movements: {
        Args: { p_usd_rate?: number; p_user_id?: string }
        Returns: Json
      }
      receive_payment: {
        Args: {
          p_amount: number
          p_date?: string
          p_description: string
          p_destination_id: string
          p_receivable_id: string
        }
        Returns: Json
      }
      rename_account: {
        Args: { p_account_id: string; p_new_name: string }
        Returns: {
          balance: number
          created_at: string
          credit_limit: number | null
          currency: string
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          is_archived: boolean
          metadata: Json | null
          name: string
          on_budget: boolean
          subtype: Database["public"]["Enums"]["account_subtype"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_category: {
        Args: { p_category_id: string; p_new_name: string }
        Returns: {
          entity: Database["public"]["Enums"]["entity_type"]
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_transaction_category: {
        Args: { p_category: string; p_transaction_id: string }
        Returns: Json
      }
      undo_transaction: { Args: { p_transaction_id: string }; Returns: Json }
      update_account_balance_manual: {
        Args: { p_account_id: string; p_new_balance: number }
        Returns: Json
      }
    }
    Enums: {
      account_subtype:
        | "debit"
        | "cash"
        | "credit_card"
        | "receivable"
        | "payable"
        | "investment"
        | "property"
      account_type: "asset" | "liability"
      debt_status: "active" | "paid" | "archived"
      document_type:
        | "factura_afecta"
        | "factura_exenta"
        | "boleta"
        | "factura_exportacion"
        | "nota_credito"
        | "nota_debito"
      entity_type: "personal" | "spa"
      invoice_direction: "emitida" | "recibida"
      invoice_status: "draft" | "sent" | "paid" | "partially_paid" | "overdue"
      snapshot_status: "balanced" | "unbalanced"
      transaction_type:
        | "income"
        | "expense"
        | "refund"
        | "transfer"
        | "debt_payment"
        | "adjustment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_subtype: [
        "debit",
        "cash",
        "credit_card",
        "receivable",
        "payable",
        "investment",
        "property",
      ],
      account_type: ["asset", "liability"],
      debt_status: ["active", "paid", "archived"],
      document_type: [
        "factura_afecta",
        "factura_exenta",
        "boleta",
        "factura_exportacion",
        "nota_credito",
        "nota_debito",
      ],
      entity_type: ["personal", "spa"],
      invoice_direction: ["emitida", "recibida"],
      invoice_status: ["draft", "sent", "paid", "partially_paid", "overdue"],
      snapshot_status: ["balanced", "unbalanced"],
      transaction_type: [
        "income",
        "expense",
        "refund",
        "transfer",
        "debt_payment",
        "adjustment",
      ],
    },
  },
} as const

