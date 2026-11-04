-- Hapus data contoh "Kos Melati" (kode MLT) beserta semua isinya.
-- Jalankan di Supabase → SQL Editor, lalu isi ulang dengan: pnpm db:seed
-- HANYA menyentuh properti berkode MLT. Kos kamu sendiri tidak ikut terhapus.
begin;

create temporary table _p on commit drop as
  select id from public.properties where code = 'MLT';

delete from public.messages        where property_id in (select id from _p);
delete from public.broadcasts      where property_id in (select id from _p);
delete from public.tenant_credits  where property_id in (select id from _p);
delete from public.payments        where property_id in (select id from _p);
delete from public.expenses        where property_id in (select id from _p);
delete from public.invoices        where property_id in (select id from _p);  -- item ikut terhapus (cascade)
delete from public.complaints      where property_id in (select id from _p);  -- riwayat ikut terhapus
delete from public.attachments     where property_id in (select id from _p);
delete from public.leases          where property_id in (select id from _p);
delete from public.tenants         where property_id in (select id from _p);
delete from public.rooms           where property_id in (select id from _p);
delete from public.properties      where id in (select id from _p);         -- sisanya cascade

commit;
