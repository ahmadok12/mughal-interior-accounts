# Mughal Glass — design system (screen UI)

Soft, minimal frosted glass in emerald and gold on a plain ivory background, set in a rounded typeface. Defined in `glass.css`, loaded after every other stylesheet. Printing, PDF documents (`.pdf-document`) and exported reports (`.report-print-document`) keep their own styling.

- **Colour:** emerald `#113328` / `#1f4f3e` / `#2a6450`, gold `#c9a24a` / `#e8d39a`, ivory ground `#f3efe4`, ink `#132019`, muted `#56655d`. Each app section keeps its own tinted top bar; Reports uses bronze `#6a5222`.
- **Type:** Nunito (rounded) everywhere, self-hosted in `assets/fonts/` (SIL OFL). Body text is weight 500; titles are weight 800. Amounts use tabular figures. Sizes on screen: page titles 30px, sheet titles 25px, list titles and buttons 15–16px, details 12.5–14px, small labels at least 11px, navigation labels 10.5px.
- **Background:** a plain ivory gradient (`#f7f5ef` to `#f0ede5`). No textures or colour washes.
- **Glass:** white at 68–80% with an 18px backdrop blur, a white hairline edge and a soft emerald shadow. It's used on tiles, lists, search, sheets, the top bar and the floating navigation. Long lists share one glass panel, so phones only blur one layer.
- **Motion:** sheets rise into place (460ms, ease-out). No motion is used when the phone asks for reduced motion.
- **Focus & selection:** gold focus rings and a gold text-selection colour.
- **Fallback:** where the browser has no backdrop blur, glass becomes a calm opaque surface.
