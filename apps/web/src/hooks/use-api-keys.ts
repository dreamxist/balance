import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { generateApiKey, hashApiKey, type Database } from '@balance/core'
import { supabase } from '@/lib/supabase'

type ApiKey = Database['public']['Tables']['api_keys']['Row']

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key_prefix, name, created_at, last_used_at, is_active')
        .order('created_at', { ascending: false })
        .returns<Pick<ApiKey, 'id' | 'key_prefix' | 'name' | 'created_at' | 'last_used_at' | 'is_active'>[]>()
      if (error) throw error
      return data
    },
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const rawKey = generateApiKey()
      const keyHash = await hashApiKey(rawKey)
      const keyPrefix = rawKey.slice(0, 8)

      const { error } = await supabase
        .from('api_keys')
        .insert({ key_hash: keyHash, key_prefix: keyPrefix, name, user_id: user.id } as Database['public']['Tables']['api_keys']['Insert'])

      if (error) throw error
      return rawKey
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: false } as Database['public']['Tables']['api_keys']['Update'])
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })
}
