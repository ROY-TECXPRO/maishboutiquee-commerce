import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Megaphone, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SitePopupCard } from '@/components/customer-week/SitePopupCard';
import { uploadProductImage } from '@/lib/adminProducts';
import { logAdminActivity } from '@/lib/adminActivity';
import {
  configToForm,
  fetchSitePopupStrict,
  formToInput,
  isPopupLive,
  saveSitePopup,
  validatePopupForm,
  type PopupFormState,
  type SitePopupConfig,
} from '@/lib/sitePopup';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

type LoadState = 'loading' | 'ready' | 'error';

function statusOf(saved: SitePopupConfig | null): { label: string; className: string } {
  if (!saved || !saved.isActive) return { label: 'Off', className: 'bg-muted text-muted-foreground' };
  if (isPopupLive(saved)) return { label: 'Live', className: 'bg-green-100 text-green-800' };
  if (saved.startsAt && Date.now() < Date.parse(saved.startsAt)) {
    return { label: 'Scheduled', className: 'bg-blue-100 text-blue-900' };
  }
  return { label: 'Ended', className: 'bg-yellow-100 text-yellow-800' };
}

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
 * Admin editor for the storefront popup. Saving writes to public.site_popups
 * (admins only, enforced by Postgres RLS) and every visitor currently on the
 * site receives it in realtime.
 */
export function AdminPopupSection(): React.JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [saved, setSaved] = useState<SitePopupConfig | null>(null);
  const [form, setForm] = useState<PopupFormState>(() => configToForm(null));
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(configToForm(null)));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewSize, setPreviewSize] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const config = await fetchSitePopupStrict();
      const next = configToForm(config);
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
  const preview = useMemo(() => formToInput(form), [form]);
  const status = statusOf(saved);

  function set<K extends keyof PopupFormState>(key: K, value: PopupFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('That image is larger than 5 MB. Please choose a smaller one.');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProductImage(file, 'popup');
      set('imageUrl', url);
      toast.success('Image uploaded. Remember to Save.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const problems = validatePopupForm(form);
    setErrors(problems);
    if (problems.length > 0) {
      toast.error('Please fix the highlighted problems before saving.');
      return;
    }

    setSaving(true);
    try {
      const result = await saveSitePopup(formToInput(form));
      const next = configToForm(result);
      setSaved(result);
      setForm(next);
      setBaseline(JSON.stringify(next));
      void logAdminActivity({
        action: 'popup.update',
        entityType: 'popup',
        entityId: result.slug,
        entityLabel: result.headline || result.badgeText || 'Popup',
        details: { isActive: result.isActive, version: result.version, ctaType: result.ctaType },
      });
      toast.success(
        result.isActive
          ? 'Saved. Visitors on the site see it now.'
          : 'Saved. The popup is switched off for visitors.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the popup.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    const original = JSON.parse(baseline) as PopupFormState;
    setForm(original);
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
    const missingTable = /site_popups|does not exist|schema cache/i.test(loadError);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900 space-y-3">
        <p className="font-semibold">The popup settings could not be loaded.</p>
        {missingTable ? (
          <p>
            The popup table is not in your database yet. In Supabase, open the SQL Editor and run
            <code className="mx-1 rounded bg-white px-1.5 py-0.5">
              supabase/migrations/20261122000000_site_popups.sql
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

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      {/* ---------------- Editor ---------------- */}
      <div className="space-y-8">
        {/* Status + master switch */}
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Storefront popup</h2>
                <p className="text-xs text-muted-foreground">
                  {saved
                    ? `Saved version ${saved.version}${
                        saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleString('en-KE')}` : ''
                      }`
                    : 'Nothing saved yet'}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 px-4 py-3">
            <div>
              <Label htmlFor="popup-active" className="text-sm font-semibold">
                Show this popup to visitors
              </Label>
              <p className="text-xs text-muted-foreground">
                Switch off to hide it everywhere. Saving applies instantly to everyone on the site.
              </p>
            </div>
            <Switch
              id="popup-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Appears after (seconds)" htmlFor="popup-delay" hint="0 to 120">
              <Input
                id="popup-delay"
                inputMode="numeric"
                value={form.delaySeconds}
                onChange={(e) => set('delaySeconds', e.target.value)}
              />
            </Field>
            <Field label="Starts (optional)" htmlFor="popup-start" hint="Leave empty to start now">
              <Input
                id="popup-start"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </Field>
            <Field label="Ends (optional)" htmlFor="popup-end" hint="Leave empty to run until switched off">
              <Input
                id="popup-end"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* Message */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">Message</h2>
          <Field label="Badge (small label on top)" htmlFor="popup-badge">
            <Input
              id="popup-badge"
              placeholder="Customer Service Week"
              value={form.badgeText}
              onChange={(e) => set('badgeText', e.target.value)}
            />
          </Field>
          <Field label="Headline" htmlFor="popup-headline">
            <Input
              id="popup-headline"
              placeholder="Happy Customer Service Week dear customer!"
              value={form.headline}
              onChange={(e) => set('headline', e.target.value)}
            />
          </Field>
          <Field label="Message" htmlFor="popup-subtitle">
            <Textarea
              id="popup-subtitle"
              rows={3}
              placeholder="Shop with us on the website and claim 30% offers."
              value={form.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Highlight (green pill, optional)" htmlFor="popup-highlight">
              <Input
                id="popup-highlight"
                placeholder="Rated 5/5"
                value={form.highlightText}
                onChange={(e) => set('highlightText', e.target.value)}
              />
            </Field>
            <Field label="Footer note (optional)" htmlFor="popup-footer">
              <Input
                id="popup-footer"
                placeholder="Limited stock. Offer ends soon!"
                value={form.footerNote}
                onChange={(e) => set('footerNote', e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* Image */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">Image</h2>
          <div className="flex flex-wrap items-center gap-3">
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Popup"
                className="h-20 w-20 rounded-md border object-contain bg-muted/40"
              />
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {form.imageUrl ? 'Replace image' : 'Upload image'}
            </Button>
            {form.imageUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set('imageUrl', '')}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
          <Field
            label="Or paste an image link"
            htmlFor="popup-image-url"
            hint="An https:// link, or a path on this site such as /images/image-pop.webp"
          >
            <Input
              id="popup-image-url"
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
            />
          </Field>
        </section>

        {/* Button / offer */}
        <section className="rounded-lg border p-5 space-y-4">
          <h2 className="font-semibold">Button</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What the button does" htmlFor="popup-cta-type">
              <select
                id="popup-cta-type"
                className={selectClass}
                value={form.ctaType}
                onChange={(e) => set('ctaType', e.target.value === 'link' ? 'link' : 'cart')}
              >
                <option value="cart">Add the offer to cart and go to checkout</option>
                <option value="link">Open a page on the site</option>
              </select>
            </Field>
            <Field label="Button label" htmlFor="popup-cta-label">
              <Input
                id="popup-cta-label"
                value={form.ctaLabel}
                onChange={(e) => set('ctaLabel', e.target.value)}
              />
            </Field>
          </div>

          {form.ctaType === 'link' ? (
            <>
              <Field
                label="Page to open"
                htmlFor="popup-link"
                hint="For example /sale, /new-arrivals or /category/men-wear"
              >
                <Input
                  id="popup-link"
                  placeholder="/sale"
                  value={form.linkPath}
                  onChange={(e) => set('linkPath', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name (optional)" htmlFor="popup-product">
                  <Input
                    id="popup-product"
                    value={form.productName}
                    onChange={(e) => set('productName', e.target.value)}
                  />
                </Field>
                <Field label="Price to show (optional)" htmlFor="popup-price" hint="KES. Leave empty to hide.">
                  <Input
                    id="popup-price"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Product name" htmlFor="popup-product">
                <Input
                  id="popup-product"
                  placeholder="Nike Air Force 1 (Black)"
                  value={form.productName}
                  onChange={(e) => set('productName', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Offer price (KES)" htmlFor="popup-price">
                  <Input
                    id="popup-price"
                    inputMode="decimal"
                    placeholder="1500"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                  />
                </Field>
                <Field
                  label='"Was" price (KES, optional)'
                  htmlFor="popup-original"
                  hint="The percentage off is worked out for you."
                >
                  <Input
                    id="popup-original"
                    inputMode="decimal"
                    placeholder="2500"
                    value={form.originalPrice}
                    onChange={(e) => set('originalPrice', e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Sizes (optional)"
                htmlFor="popup-sizes"
                hint="Separate with commas, e.g. 39, 40, 41. Leave empty if the item has no sizes."
              >
                <Input
                  id="popup-sizes"
                  value={form.sizes}
                  onChange={(e) => set('sizes', e.target.value)}
                />
              </Field>
            </>
          )}
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
          <Button onClick={() => void handleSave()} disabled={saving || uploading || !dirty}>
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

      {/* ---------------- Live preview ---------------- */}
      <aside className="lg:sticky lg:top-6 self-start space-y-3">
        <p className="text-sm font-semibold">Preview</p>
        <p className="text-xs text-muted-foreground">
          This is what visitors see. It updates as you type; nothing is published until you save.
        </p>
        <div className="rounded-2xl bg-black/60 p-4">
          <SitePopupCard
            config={preview}
            selectedSize={previewSize}
            error={null}
            onSelectSize={setPreviewSize}
            onClose={() => undefined}
            onClaim={() => undefined}
          />
        </div>
      </aside>
    </div>
  );
}

export default AdminPopupSection;
