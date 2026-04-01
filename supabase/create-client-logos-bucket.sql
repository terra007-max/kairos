-- Create public client-logos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-logos',
  'client-logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Workspace admins/partners can upload client logos
CREATE POLICY "Admins can upload client logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-logos');

-- Workspace admins/partners can update/replace client logos
CREATE POLICY "Admins can update client logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-logos');

-- Workspace admins/partners can delete client logos
CREATE POLICY "Admins can delete client logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-logos');

-- Everyone can read client logos (public bucket)
CREATE POLICY "Client logos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'client-logos');
