-- Migrasi kustom: trigger & Row Level Security (RLS)
-- Lihat specs/04-database.md § 4. Ditulis tangan, tidak dibuat ulang oleh drizzle-kit.

-- ===========================================================================
-- 1. updated_at otomatis
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'properties', 'property_settings', 'rooms', 'tenants', 'leases',
    'invoices', 'payments', 'complaints', 'message_templates', 'messages', 'expenses'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

-- ===========================================================================
-- 2. Profil otomatis untuk user baru Supabase Auth
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1), ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- ===========================================================================
-- 3. Properti baru → pengaturan default + pembuat jadi owner
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.property_settings (property_id) VALUES (NEW.id)
  ON CONFLICT (property_id) DO NOTHING;

  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.property_members (property_id, user_id, role, can_view_finance)
    VALUES (NEW.id, NEW.created_by, 'owner', true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER properties_after_insert
  AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_property();
--> statement-breakpoint

-- ===========================================================================
-- 4. Sewa: cek kapasitas kamar & sinkronkan status kamar (FR-1.3, FR-2.3)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.check_room_capacity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_capacity smallint;
  v_active int;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- kunci baris kamar agar dua check-in bersamaan tidak lolos
  SELECT capacity INTO v_capacity FROM public.rooms WHERE id = NEW.room_id FOR UPDATE;

  SELECT count(*) INTO v_active
  FROM public.leases
  WHERE room_id = NEW.room_id AND status = 'active' AND id <> NEW.id;

  IF v_active >= v_capacity THEN
    RAISE EXCEPTION 'Kamar sudah penuh (kapasitas %)', v_capacity
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER leases_check_capacity
  BEFORE INSERT OR UPDATE OF status, room_id ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.check_room_capacity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.sync_room_status(p_room_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.leases WHERE room_id = p_room_id AND status = 'active') THEN
    UPDATE public.rooms SET status = 'occupied'
    WHERE id = p_room_id AND status <> 'occupied';
  ELSE
    UPDATE public.rooms SET status = 'vacant'
    WHERE id = p_room_id AND status = 'occupied';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.leases_sync_room() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.sync_room_status(OLD.room_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.sync_room_status(NEW.room_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER leases_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.leases
  FOR EACH ROW EXECUTE FUNCTION public.leases_sync_room();
--> statement-breakpoint
-- Kamar dengan sewa aktif tidak boleh diubah manual menjadi kosong (AC FR-1.3)
CREATE OR REPLACE FUNCTION public.rooms_guard_status() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'vacant' AND OLD.status IS DISTINCT FROM 'vacant'
     AND EXISTS (SELECT 1 FROM public.leases WHERE room_id = NEW.id AND status = 'active') THEN
    RAISE EXCEPTION 'Kamar masih punya penghuni aktif. Lakukan check-out terlebih dahulu.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rooms_guard_status
  BEFORE UPDATE OF status ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.rooms_guard_status();
--> statement-breakpoint

-- ===========================================================================
-- 5. Tagihan: hitung ulang total, paid_amount, status (FR-3.5, FR-4.4)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.recalc_invoice(p_invoice_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_total bigint;
  v_paid bigint;
BEGIN
  SELECT coalesce(sum(amount), 0) INTO v_total
  FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  SELECT coalesce(sum(amount), 0) INTO v_paid
  FROM public.payments WHERE invoice_id = p_invoice_id AND status = 'verified';

  UPDATE public.invoices i SET
    total = v_total,
    paid_amount = v_paid,
    status = CASE
      WHEN i.status IN ('void', 'draft') THEN i.status
      WHEN v_paid >= v_total THEN 'paid'::public.invoice_status
      WHEN v_paid > 0 THEN 'partial'::public.invoice_status
      ELSE 'issued'::public.invoice_status
    END,
    paid_at = CASE
      WHEN i.status NOT IN ('void', 'draft') AND v_paid >= v_total THEN coalesce(i.paid_at, now())
      WHEN i.status IN ('void', 'draft') THEN i.paid_at
      ELSE NULL
    END
  WHERE i.id = p_invoice_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.invoice_children_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
    PERFORM public.recalc_invoice(OLD.invoice_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalc_invoice(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.invoice_children_changed();
--> statement-breakpoint
CREATE TRIGGER payments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.invoice_children_changed();
--> statement-breakpoint
-- Tagihan diaktifkan kembali dari draft → hitung ulang status
CREATE OR REPLACE FUNCTION public.invoices_status_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    PERFORM public.recalc_invoice(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_after_status_change
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_status_changed();
--> statement-breakpoint

-- ===========================================================================
-- 6. Komplain: nomor urut per properti & waktu selesai
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.complaints_before_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('complaint_number:' || NEW.property_id::text));
    SELECT coalesce(max(number), 0) + 1 INTO NEW.number
    FROM public.complaints WHERE property_id = NEW.property_id;
  END IF;

  IF NEW.status = 'resolved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER complaints_before_write
  BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_before_write();
--> statement-breakpoint

-- ===========================================================================
-- 7. Row Level Security
-- ===========================================================================
-- Helper: SECURITY DEFINER agar tidak terjadi rekursi RLS pada property_members.
CREATE OR REPLACE FUNCTION public.is_property_member(p_property_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members
    WHERE property_id = p_property_id AND user_id = auth.uid()
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_property_owner(p_property_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members
    WHERE property_id = p_property_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.can_view_finance(p_property_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_members
    WHERE property_id = p_property_id AND user_id = auth.uid()
      AND (role = 'owner' OR can_view_finance)
  );
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'properties', 'property_members', 'property_settings', 'rooms', 'tenants',
    'leases', 'invoices', 'invoice_items', 'payments', 'tenant_credits', 'complaints',
    'complaint_updates', 'attachments', 'message_templates', 'broadcasts', 'messages',
    'expenses', 'audit_logs', 'job_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;
--> statement-breakpoint

-- profiles: diri sendiri + rekan satu properti boleh baca; hanya diri sendiri yang ubah
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.property_members m
      WHERE m.user_id = profiles.id AND public.is_property_member(m.property_id)
    )
  );
--> statement-breakpoint
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--> statement-breakpoint

-- properties
-- created_by: `INSERT ... RETURNING` mengecek policy SELECT sebelum trigger AFTER
-- membuat keanggotaan owner, jadi pembuat perlu boleh membaca barisnya sendiri.
CREATE POLICY properties_select ON public.properties FOR SELECT TO authenticated
  USING (public.is_property_member(id) OR created_by = auth.uid());
--> statement-breakpoint
CREATE POLICY properties_insert ON public.properties FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
--> statement-breakpoint
CREATE POLICY properties_update ON public.properties FOR UPDATE TO authenticated
  USING (public.is_property_owner(id)) WITH CHECK (public.is_property_owner(id));
--> statement-breakpoint

-- property_members: anggota bisa lihat tim; hanya owner yang kelola
CREATE POLICY property_members_select ON public.property_members FOR SELECT TO authenticated
  USING (public.is_property_member(property_id));
--> statement-breakpoint
CREATE POLICY property_members_write ON public.property_members FOR ALL TO authenticated
  USING (public.is_property_owner(property_id))
  WITH CHECK (public.is_property_owner(property_id));
--> statement-breakpoint

-- property_settings
CREATE POLICY property_settings_select ON public.property_settings FOR SELECT TO authenticated
  USING (public.is_property_member(property_id));
--> statement-breakpoint
CREATE POLICY property_settings_update ON public.property_settings FOR UPDATE TO authenticated
  USING (public.is_property_owner(property_id))
  WITH CHECK (public.is_property_owner(property_id));
--> statement-breakpoint

-- Tabel operasional: anggota properti boleh baca, tambah, ubah.
-- Tidak ada policy DELETE → hapus ditolak (soft delete / batalkan saja).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rooms', 'tenants', 'leases', 'invoices', 'payments', 'tenant_credits',
    'complaints', 'attachments', 'message_templates', 'broadcasts', 'messages'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_property_member(property_id))',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_property_member(property_id))',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_property_member(property_id)) WITH CHECK (public.is_property_member(property_id))',
      t || '_update', t);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE POLICY attachments_delete ON public.attachments FOR DELETE TO authenticated
  USING (public.is_property_member(property_id));
--> statement-breakpoint

-- invoice_items: lewat tagihan induk; boleh dihapus selama tagihan belum lunas/batal
CREATE POLICY invoice_items_select ON public.invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.id = invoice_id AND public.is_property_member(i.property_id)));
--> statement-breakpoint
CREATE POLICY invoice_items_write ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.id = invoice_id AND public.is_property_member(i.property_id)
                   AND i.status NOT IN ('paid', 'void')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i
                      WHERE i.id = invoice_id AND public.is_property_member(i.property_id)
                        AND i.status NOT IN ('paid', 'void')));
--> statement-breakpoint

-- complaint_updates: lewat komplain induk, tidak bisa diubah/dihapus
CREATE POLICY complaint_updates_select ON public.complaint_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.complaints c
                 WHERE c.id = complaint_id AND public.is_property_member(c.property_id)));
--> statement-breakpoint
CREATE POLICY complaint_updates_insert ON public.complaint_updates FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.complaints c
                      WHERE c.id = complaint_id AND public.is_property_member(c.property_id)));
--> statement-breakpoint

-- expenses: hanya owner / manager dengan izin keuangan (FR-10.2)
CREATE POLICY expenses_all ON public.expenses FOR ALL TO authenticated
  USING (public.can_view_finance(property_id))
  WITH CHECK (public.can_view_finance(property_id));
--> statement-breakpoint

-- audit_logs: anggota boleh menulis, hanya owner yang membaca
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (property_id IS NULL OR public.is_property_member(property_id));
--> statement-breakpoint
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_property_owner(property_id));
--> statement-breakpoint

-- job_runs: ditulis sistem (service role), dibaca anggota
CREATE POLICY job_runs_select ON public.job_runs FOR SELECT TO authenticated
  USING (property_id IS NULL OR public.is_property_member(property_id));
