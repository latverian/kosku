-- Bucket Supabase Storage (privat). Semua akses file lewat server dengan
-- service role + signed URL berumur pendek (NFR-4), jadi tidak perlu policy
-- storage untuk anon/authenticated.
-- Dilewati otomatis di PostgreSQL biasa (lokal/CI) yang tidak punya skema storage.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('id-cards', 'id-cards', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
      ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
      ('complaint-photos', 'complaint-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
      ('receipts', 'receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
