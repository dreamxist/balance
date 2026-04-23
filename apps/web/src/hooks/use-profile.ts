import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface ProfileFeatures {
  spa?: boolean
  investments?: boolean
  rentals?: boolean
  taxes?: boolean
}

interface Profile {
  id: string
  name: string | null
  phone: string | null
  features: ProfileFeatures
  is_onboarded: boolean
  created_at: string
  updated_at: string
}

export type { Profile, ProfileFeatures }

export function hasFeature(profile: Profile | undefined, feature: keyof ProfileFeatures): boolean {
  return profile?.features?.[feature] === true
}

export function useProfile(): UseQueryResult<Profile> {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data as unknown as Profile
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  })
}
