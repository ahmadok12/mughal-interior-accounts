-- Business details printed on quotes, invoices and reports, plus the partner name used for drawings.
-- Editable in the app: open any quote or invoice, tap ✎ on the disclaimer -> Edit print details.
-- Empty values fall back to the current printed details, so nothing changes until you edit them.
-- Safe to run more than once.

alter table public.businesses
  add column if not exists document_proprietor text,
  add column if not exists document_address text,
  add column if not exists document_whatsapp text,
  add column if not exists partner_name text;

-- Same rule as the disclaimer: only owners and managers pass the existing update policy.
grant update (document_disclaimer, document_proprietor, document_address, document_whatsapp, partner_name)
  on public.businesses to authenticated;

notify pgrst, 'reload schema';
