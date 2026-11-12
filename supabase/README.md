# Database (Supabase project: Carpenter Acc App)

| Folder | What it is |
|---|---|
| `migrations/` | The ordered list of database changes from now on. File names start with a timestamp; they run oldest first. |
| `checks/` | Read-only queries. They never change data. Run them any time. |
| `archive/` | The old `supabase-*.sql` files, kept for history. **Do not run these again.** Several of them redefine the same functions, so running one out of order can undo a later fix. |

## Migrations so far

| File | What it does | Status |
|---|---|---|
| `20261109000000_unique_material_sku.sql` | Material codes unique per business | Run on 9 Nov 2026 |
| `20261110000000_quick_refresh_sync.sql` | Database stamps `updated_at` on every change and logs deletes, so the app refreshes only what changed after a save | Run in the SQL Editor |
| `20261110000100_business_print_details.sql` | Proprietor, address, WhatsApp and partner name become editable print details | Run in the SQL Editor |

The app works before and after these run: without them it simply reloads everything after each save and prints the default details.

## Rule for every future database change

1. Add a new file to `migrations/` named `YYYYMMDDHHMMSS_short_description.sql`.
2. Write it so it is safe to run twice (`if not exists`, `create or replace`, guarded `do $$` blocks).
3. Run it once in the SQL Editor (or with `supabase db push`), then commit it.
4. Never edit a migration that has already been run. Write a new one instead.

## One-time setup: capture the live database as a baseline

The archive files no longer describe the live database exactly, so take a snapshot of what is really there. This needs the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and Docker Desktop running.

```sh
npx supabase login
npx supabase link --project-ref acjvusohdqkeuxtllgso
npx supabase db dump -f supabase/migrations/20261101000000_baseline.sql
```

Open the dumped file and check it contains `create table` lines for parties, projects, payments and the other tables, plus the `private` functions and policies. Then tell the CLI that both migrations are already applied, so they are never re-run on the live database:

```sh
npx supabase migration repair --status applied 20261101000000 20261109000000 20261110000000 20261110000100
```

Commit `supabase/migrations/20261101000000_baseline.sql`. From then on, `baseline + migrations/` fully rebuilds the database.

> Take the baseline dump **after** running all migrations listed above, so the snapshot already includes them. The `repair` step marks them as applied.
