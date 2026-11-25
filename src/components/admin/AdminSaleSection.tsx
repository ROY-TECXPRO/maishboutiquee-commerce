import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { logAdminActivity } from '@/lib/adminActivity';
import { selectOfferProducts, useCatalog } from '@/lib/catalog';
import {
  configToSaleForm,
  fetchSiteSaleStrict,
  formToSaleInput,
  normalizeCouponCode,
  saveSiteSale,
  validateSaleForm,
  type SaleFormState,
  type SiteSaleConfig,
} from '@/lib/siteSale';

type LoadState = 'loading' | 'ready' | 'error';

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Admin editor for the Sale page and its weekend coupon. Saving writes to
 * public.site_sale (admins only, enforced by Postgres RLS) and every visitor
 * currently on the site receives the change in realtime.
 */
export function AdminSaleSection(): React.JSX.Element {
  const { products } = useCatalog();
  const offerCount = useMemo(
    () => selectOfferProducts(products, Math.max(products.length, 1)).length,
    [products]
  );

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<SiteSaleConfig | null>(null);
  const [form, setForm] = useState<SaleFormState>(() => configToSaleForm(null));
  const [baseline, setBaseline] = useState(() => JSON.stringify(configToSaleForm(null)));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const config = await fetchSiteSaleStrict();
      const next = configToSaleForm(config);
      setSaved(config);
      setForm(next);
      setBaseline(JSON.stringify(next));
      setErrors([]);
      setLoadState('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unknown error');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== baseline, [form, baseline]);

  function set<K extends keyof SaleFormState>(key: K, value: SaleFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const problems = validateSaleForm(form);
    setErrors(problems);
    if (problems.length > 0) {
      toast.error('Please fix the highlighted problems before saving.');
      return;
    }

    setSaving(true);
    try {
      const result = await saveSiteSale(formToSaleInput(form));
      const next = configToSaleForm(result);
      setSaved(result);
      setForm(next);
      setBaseline(JSON.stringify(next));
      void logAdminActivity({
        action: 'sale.update',
        entityType: 'sale',
        entityId: result.slug,
        entityLabel: result.title || 'Sale',
        details: {
          isActive: result.isActive,
          version: result.version,
          hasCoupon: result.couponCode !== '',
          discountPercent: result.discountPercent,
        },
      });
      toast.success(
        result.isActive
          ? 'Saved. The Sale page is live for all visitors.'
          : 'Saved. The Sale page is switched off.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the sale.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setForm(JSON.parse(baseline) as SaleFormState);
    setErrors([]);
  }

  if (loadState === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadState === 'error') {
    const missingTable = /site_sale|does not exist|schema cache/i.test(loadError);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900 space-y-3">
        <p className="font-semibold">The sale settings could not be loaded.</p>
        {missingTable ? (
          <p>
            The sale table is not in your database yet. In Supabase, open the SQL Editor and run
            <code className="mx-1 rounded bg-white px-1.5 py-0.5">
              supabase/migrations/20261124000000_site_sale.sql
            </code>
            then press Try again.
          </p>
        ) : (
          <p className="break-words">{loadError}</p>
        )}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  const previewCode = normalizeCouponCode(form.couponCode);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="space-y-6">
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Sale page</h2>
              <p className="text-xs text-muted-foreground">
                {saved
                  ? `Saved version ${saved.version}${
                      saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleString('en-KE')}` : ''
                    }`
                  : 'Nothing saved yet'}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                saved?.isActive ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
              }`}
            >
              {saved?.isActive ? 'On' : 'Off'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 px-4 py-3">
            <div>
              <Label htmlFor="sale-active" className="text-sm font-semibold">
                Sale is on
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, visitors see &ldquo;No sale at the moment&rdquo; and the coupon stops
                working. Saving applies instantly to everyone on the site.
              </p>
            </div>
            <Switch
              id="sale-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
            />
          </div>

          <Field label="Title" htmlFor="sale-title">
            <Input
              id="sale-title"
              placeholder="Weekend Sale"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <Field label="Message (optional)" htmlFor="sale-subtitle">
            <Textarea
              id="sale-subtitle"
              rows={3}
              placeholder="Special offers this weekend only."
              value={form.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </Field>
        </section>

        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">Weekend coupon</h2>
          <p className="text-xs text-muted-foreground">
            The code is shown only on the Sale page, and only on Friday, Saturday and Sunday
            (Nairobi time). It works at the cart and checkout on those days only. Leave the code
            empty for no coupon.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Coupon code"
              htmlFor="sale-code"
              hint="3 to 20 letters or numbers. Saved in capitals."
            >
              <Input
                id="sale-code"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="WEEKEND15"
                value={form.couponCode}
                onChange={(e) => set('couponCode', e.target.value)}
              />
            </Field>
            <Field label="Discount (%)" htmlFor="sale-percent" hint="Whole number, 1 to 90.">
              <Input
                id="sale-percent"
                inputMode="numeric"
                value={form.discountPercent}
                onChange={(e) => set('discountPercent', e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="font-semibold">Products on the Sale page</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every product with the <strong>Offer</strong> switch on appears here and in the
            homepage Offers row automatically.{' '}
            <strong>
              {offerCount} {offerCount === 1 ? 'product is' : 'products are'}
            </strong>{' '}
            on offer right now. Switch a product&rsquo;s Offer on or off from the Products tab.
          </p>
        </section>

        {errors.length > 0 && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Please fix these before saving:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save and publish
          </Button>
          <Button variant="outline" onClick={handleDiscard} disabled={saving || !dirty}>
            <Undo2 className="mr-2 h-4 w-4" />
            Discard changes
          </Button>
          <span className="text-xs text-muted-foreground">
            {dirty ? 'You have unsaved changes.' : 'Everything is saved.'}
          </span>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        <p className="text-sm font-semibold">Preview of the Sale page header</p>
        <div className="overflow-hidden rounded-xl border">
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-500 px-5 py-8 text-center text-white">
            <p className="font-display text-2xl font-bold">{form.title || 'Sale title'}</p>
            {form.subtitle && <p className="mt-2 text-sm text-white/90">{form.subtitle}</p>}
          </div>
          {previewCode && (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Use this code at checkout for {form.discountPercent || '0'}% off
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-primary">
                {previewCode}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Valid Friday, Saturday and Sunday only.</p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing is published until you press Save and publish.
        </p>
      </aside>
    </div>
  );
}

export default AdminSaleSection;
