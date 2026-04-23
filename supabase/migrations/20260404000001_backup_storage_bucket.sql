-- Create private storage bucket for automated backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT DO NOTHING;

-- Users can read their own backups (folder = user_id)
CREATE POLICY "Users read own backups" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'backups'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Service role can manage all backups (Edge Function uses service_role)
CREATE POLICY "Service role manages backups" ON storage.objects
  FOR ALL USING (
    bucket_id = 'backups'
    AND auth.role() = 'service_role'
  );
