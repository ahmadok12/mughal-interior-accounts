# Mughal Interior Accounts — deployment

This folder contains the complete testable V1 for customers, project quotations, invoices, inventory, suppliers, material purchase bills, walk-in orders, cash/bank payments, reports, dashboard alerts, staff permissions, business settings, and data backup.

## Part A — Create the Supabase backend

1. Open the existing Supabase project **Carpenter Acc App**.
2. For a fresh database, run the SQL files in this order:
   - `supabase/archive/supabase-schema.sql`
   - `supabase/archive/supabase-projects-module.sql`
   - `supabase/archive/supabase-project-quotation-invoices.sql`
   - `supabase/archive/supabase-migrate-legacy-quotations.sql`
   - `supabase/archive/supabase-inventory-module.sql`
   - `supabase/archive/supabase-inventory-policy-hardening.sql`
   - `supabase/archive/supabase-suppliers-purchase-bills.sql`
   - `supabase/archive/supabase-walk-in-orders.sql`
   - `supabase/archive/supabase-payments-accounts.sql`
   - `supabase/archive/supabase-complete-v1.sql`

   > **Note:** the live database has since been changed by further `supabase/archive/supabase-*.sql` files (mobile, labour, orders, purchasing, opening balances, drawings, bulk materials and fixes) that are not in this list, and some functions are defined in more than one file. Do not rebuild a database from this list alone. These files now live in `supabase/archive/` for history only. All new database changes go in `supabase/migrations/`; see `supabase/README.md`.
3. Open **Authentication → Providers → Email** and keep Email enabled.
4. For controlled testing, turn off public user sign-up after creating the test accounts.
5. Open **Authentication → Users → Add user**. Create the owner's email/password account. Select the option that marks the email as confirmed.
6. Create each tester in the same way. Confirm the tester's email, then sign in as the owner and open **Settings → Team → Add member**. Enter that registered email and choose Manager, Staff, or Viewer.
7. Open the project **Connect** dialog or **Settings → API Keys**. Copy:
   - Project URL
   - Publishable key beginning with `sb_publishable_`
8. `config.js` is already connected to **Carpenter Acc App** with its publishable browser key. Never paste a secret key or service-role key into this file.
9. In Supabase, open **Authentication → URL Configuration**. After GitHub Pages is deployed, add the GitHub Pages address as the Site URL and Redirect URL.

## Part B — Deploy the frontend to GitHub Pages

1. Use the GitHub repository `ahmadecom7337/mughal-interior-accounts`.
2. Push or merge changes to the `main` branch.
3. The workflow in `.github/workflows/deploy-pages.yml` runs the automated tests first. The site deploys only when every test passes.
4. Only the app's own files are published:
   - `index.html`, `offline.html`, `manifest.webmanifest`, `sw.js`, `config.js`
   - `app-mobile.js`, `reports-mobile.js`, `mobile-controls.js`, `entry-steps.js`, `carpenter-loader.js`, `pwa.js`
   - `mobile.css`, `reports-mobile.css`, `mobile-controls.css`, `print-branding.css`, `pwa.css`, `glass.css`, `entry-steps.css`, `carpenter-loader.css`
   - the `assets/` folder

   SQL files, tests and documentation stay in the repository but are not served on the website. If you add a new runtime file, also add it to the "Collect app files only" step in the workflow.
5. Pull requests run the tests without deploying.
6. If GitHub asks for a Pages source once, open **Settings → Pages** and choose **GitHub Actions**.
7. Open the Pages address shown by GitHub after deployment completes.
8. Sign in with the Supabase test account and test on both a phone and computer.

## Recommended test checklist

- Add and edit a party.
- Search parties by name, phone, and address.
- Create, print, and approve a project quotation.
- Generate an invoice only from an approved project.
- Add a material and assign it to an approved project.
- Add a supplier and post a purchase bill with two material lines.
- Verify the purchase bill increases both material stock quantities.
- Print the purchase bill and choose **Save as PDF**.
- Create a walk-in order and move it from Pending to In Progress, Ready, and Delivered.
- Add a receipt, labour cost, expense, and material to the walk-in order.
- Verify the material assignment reduces stock and appears as an internal order cost.
- Print the walk-in customer order and verify internal costs and profit are excluded.
- Add cash, bank, and mobile-wallet payment accounts.
- Receive a customer payment against an approved project and a walk-in order; verify each balance decreases.
- Pay an unpaid supplier bill and verify its paid and due amounts update.
- Record other business income and an expense.
- Transfer money between two accounts and verify the total business balance does not change.
- Open an account ledger and print a payment record.
- Review project and order profitability, cash flow, receivables, and supplier payables.
- Filter reports by date and relevant business entity, then export CSV and save PDF.
- Verify that unassigned purchases remain inventory and only assigned material appears as a job cost.
- Check dashboard alerts for expiring quotations, overdue work and bills, and low stock.
- Update business contact details and defaults; create a new quotation and invoice to verify those defaults.
- Add a Viewer account and verify that create/edit/payment controls are hidden while reports remain available.
- Download the JSON business backup from **Settings → Data & account**.
- Refresh the page and verify that online data remains available.
- Check tap targets, font sizes, forms, scrolling, and keyboard behaviour on mobile.

Posted payments are immutable accounting records. Correct a mistaken payment with an opposite transaction rather than editing its amount or account.
