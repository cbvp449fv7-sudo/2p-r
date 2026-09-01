# Identity contract — أريج شاولي للخياطة intro sequence

**Status:** written before implementation, as the brief requires.
**Audience:** whoever builds the intro. Written in English because it governs code;
all customer-facing strings it quotes stay in Arabic.
**How to use it:** every design decision gets run through §7. A proposal that fails
any clause in §1, §2 or §4 is rejected, not negotiated.

This contract exists because a 3D intro is the single easiest way to accidentally
replace this brand with a different one. The identity is the constraint. The intro
is the variable.

---

## 1. Brand qualities that must survive the intro

Each is stated with the test that decides it, so this is checkable rather than a
matter of taste.

| # | Quality | Fails the contract if… |
|---|---|---|
| 1 | **Handmade, one pair of hands** | The intro implies factory, scale, automation, or a production line. The hero already says «خياطة يد واحدة» — the intro must not contradict it. |
| 2 | **Made to measure** | Anything suggests off-the-shelf sizing, or a "size selector" metaphor. |
| 3 | **Calm and devotional** | Motion is energetic, bouncy, snappy, or celebratory. These are prayer garments. Excitement here means *anticipation and care*, not *hype*. |
| 4 | **Feminine and warm, not luxury-generic** | The result would look at home on a perfume or watch brand. Warm ≠ gold-and-black. |
| 5 | **Modest** | Any depiction of a body, silhouette, skin, or a figure wearing the garment. The existing photography uses a faceless mannequin — the intro must be at least as modest. **Prefer fabric alone: no figure at all.** |
| 6 | **Truthful** | Anything on screen implies a state that is not real (see §6). |
| 7 | **Saudi, Arabic-first** | Latin type carries the brand moment, or the reveal reads left-to-right. The wordmark is أريج شاولي; RTL governs layout and any directional motion. |

---

## 2. Tokens the intro must reuse

Not "similar colours" — **these exact values**, already defined in
`tailwind.config.js`. The intro imports them; it does not restate them.

### Surfaces — the intro's ground is the site's ground

| Token | Value | Role in the intro |
|---|---|---|
| `page` | `#EFE6DA` | The intro's background. Not black, not white. |
| `card` | `#F8F3EC` | Raised surfaces, the skip control |
| `deep` | `#E4D9C9` | Recessed areas, shadow ground |

### The one dark and the one accent

| Token | Value | Role |
|---|---|---|
| `plum` | `#6B4B5E` | The only permitted dark. The brand-reveal moment may use `plum.dark` `#523A48`. |
| `ink` | `#2E2A28` | Text |
| `ivory` | `#FAF7F3` | Text *on* plum only — never a background |

### Fabric tints — the intro's cloth colours come from real garments

`blush #F1DCD3` (AS-01) · `lilac #E6DAEC` (AS-02) · `mint #D9E8DF` (AS-03) ·
`sand #EEE0C6` (AS-04) · `sky #DDE6EF` (AS-05)

**The cloth in the intro must be one of these five, because each is sampled from a
garment she actually made.** Inventing a sixth colour for the intro breaks the rule
that the site's colour comes from the product.

### Type

- Display: **Amiri** (`font-display`) — the reveal, the wordmark, any headline
- UI: **Tajawal** (`font-sans`) — the skip control, any label
- No third typeface. No Latin display face. No letter-spacing effects on Arabic —
  Arabic script is cursive and tracking breaks the joins.

### Geometry and depth

- Radii already in use: `rounded-full`, `rounded-2xl`, `rounded-[2rem]`,
  `rounded-[1.75rem]`. The intro picks from these; it does not introduce sharp
  corners or a new radius scale.
- Shadows: the existing `card` and `lift` values. No glows. No coloured shadows.
- Motion vocabulary already on the site: `200ms` (buttons), `300ms` (cards),
  `500ms` (image scale). **The intro may run longer per beat, but its easing must
  feel like the same hand** — gentle ease-out, no overshoot, no spring, no bounce.

### Motifs to carry across (§ the brief asks for one or two)

Four already exist as CSS components and are the intro's link to the site:
`.stitch` (running-stitch divider) · `.ticks` (tape-measure marks) ·
`.woven` (fabric label) · `.seamed` (dashed inner seam).

**Pick exactly two.** Recommended: **the running stitch** (it can literally draw
itself during the craft beat) and **the tape-measure ticks** (they already sit under
the hero h1, so the handoff is seamless). Using all four makes the intro busy and
leaves nothing distinctive.

---

## 3. The emotional response to aim for

> *"Someone is making this carefully, and she will make mine."*

In order: **calm → attention → recognition of craft → trust → readiness to ask.**

Explicitly **not**: awe at the technology, surprise, delight-as-spectacle,
luxury-brand intimidation, or urgency.

The test: if a viewer's first reaction is about the animation rather than about the
garment or the maker, the intro has failed regardless of how well it is executed.

---

## 4. Effects that conflict with this brand — do not use

Each with the reason, so the list can be extended by the same logic rather than
treated as arbitrary.

| Banned | Why it conflicts |
|---|---|
| Particles, sparkles, bokeh, dust motes | Decoration with no relationship to sewing. The brief's own rule. |
| Neon, glow, bloom, emissive materials | Reads tech-demo; nothing in a sewing room glows. |
| Black or near-black backgrounds | The site has **no** dark surface except the plum About section. A black intro is a different brand for three seconds. |
| Gold gradients, chrome, metallic shaders | Generic luxury. Her mark is black line-art on cream. |
| Chromatic aberration, lens flare, film grain, glitch | Cinematic effects unrelated to cloth. |
| Aggressive camera moves — orbits, dolly zooms, fly-throughs | The viewer is not flying. Camera should be nearly still; **the fabric moves, not the world.** |
| Physics-y bounce, elastic, overshoot easing | Cloth settles; it does not bounce. |
| A rotating 3D logo | The logo is a flat printed label. Rotating it in space misrepresents the object. |
| Text that assembles letter-by-letter | Breaks Arabic cursive joins. Fade or mask-reveal whole words only. |
| Countdowns, progress bars that aren't real, "loading 87%" | See §6. |
| Any human figure, silhouette, or body form | See §1.5. |
| Sound | Nobody expects audio from a tailoring catalogue; it would be intrusive, and on a page about prayer garments, doubly so. |

---

## 5. Relationship between the 3D scene and the homepage hero

This is the clause most likely to be violated, so it is specified as a measurable
requirement rather than a principle.

**The intro is not a separate screen that ends. It is the homepage hero arriving.**

### The handoff rule

The intro's final frame must be **visually indistinguishable from the settled
homepage hero**. The 3D canvas fades out over an already-rendered DOM hero
underneath it — it does not "navigate" anywhere.

Concretely, at the end of the intro these must already be in their final position,
size and colour, matching `src/pages/index.html`:

1. Background: the `from-blush via-page to-page` gradient
2. `<span class="woven">خياطة يد واحدة</span>`
3. `<h1>` أطقم صلاة مخيطة على **مقاسكِ** — with مقاسكِ in `plum`
4. The `.ticks` rule beneath it
5. The hero product image (AS-01)
6. Both CTAs — WhatsApp primary, «تصفّحي التصاميم» secondary

**Acceptance test:** screenshot the intro's last frame and the settled hero at the
same viewport. They should differ only by the canvas opacity. If the hero *moves*
after the intro ends, the handoff is wrong.

### Which fabric, and why it matters

The cloth in the scene should be **AS-01's actual print** — the rose floral already
used as the hero image. Then the transformation resolves into the very garment the
hero shows, and the intro is about her work rather than about cloth in general.

### The DOM is never blocked

The full homepage exists in the DOM from first paint. The intro is an overlay above
it. Removing the overlay reveals a page that was always there, already scrollable,
already containing the WhatsApp CTA.

---

## 6. Truth constraints specific to the intro

The site's core rule — never state an unconfirmed business fact — extends to motion:

- **No simulated sewing progress.** A stitch animating across cloth is decoration
  and is fine. A progress indicator implying "her machine is running" is a lie.
- **A loading indicator may only reflect real asset loading.** If you cannot measure
  it, show an indeterminate state, not a percentage.
- **No stock urgency, no counters, no "X people viewing".**
- **Availability wording in the post-intro screen comes from `data/products.js`**,
  same as everywhere else.
- **The fabric's rendered properties are a stylisation, not a claim.** The intro must
  not imply weight, sheen or fibre — `fabric` is still `null` for every design, and
  a convincing silk shader would be an invented fact rendered at 60fps.

---

## 7. The decision test

Run every proposal through these six questions. Any "no" means redesign.

1. **Does this motion mean something?** Can it be named as material, craft,
   measurement, transformation, or reveal? If it is there to fill space, cut it.
2. **Does it use only §2 tokens?** Any new colour, font, radius or shadow needs a
   written reason and an update to this contract.
3. **Would the last frame still hand off cleanly to the hero?** (§5)
4. **Is anything on screen untrue?** (§6)
5. **Does it survive being skipped in the first 200ms?** The skip control is present
   and focused-reachable from frame one; nothing essential lives only inside the intro.
6. **Would a Saudi woman shopping for a prayer garment on a mid-range Android over
   4G experience this as care, or as a delay?** If the honest answer is delay, the
   budget in §8 is already blown.

---

## 8. Budget — and an unresolved tension in the brief worth naming

The brief asks for a Three.js intro **and** says (Performance requirements) *"do not
introduce large libraries for functionality that vanilla JavaScript can handle."*
Those pull against each other, and whoever implements should resolve it deliberately
rather than discover it late.

Measured, not estimated — the entire site's CSS + JS + data is **13.5 KB gzipped**
(`site.css` 6.4 KB, `site.js` 4.1 KB, `products.js` 2.2 KB, `business.js` 1.5 KB),
with imagery the only heavy payload. A minimal Three.js build is **~150 KB gzipped**:
roughly **eleven times the whole current site**, before a single texture.

**Proposed budget:** the intro must not add more than **60 KB gzipped** to the
critical path, and must not delay first paint of the homepage at all (it loads after,
and only when it will actually play).

**Recommendation, for the owner of the brief to accept or reject:** the narrative in
§3 — cloth settling, a stitch drawing itself, a fold resolving into the hero, the
label appearing — is achievable in **2D canvas or animated SVG plus CSS**, at roughly
a tenth of the weight, with no WebGL failure modes to design around. The requirement
is the *story*; WebGL is one implementation of it. If the 3D is wanted for its own
sake that is a legitimate choice, but it should be a choice, not an assumption.

Either way, mobile should get the lighter path — which the brief already requires.

---

## 9. Assets this intro needs that we do not have

Honest gap list, so nobody fills it by invention:

- **A flat photograph of one fabric**, shot straight-on in even light, for the cloth
  texture. Cropping the mannequin photo gives folds, shadow and a garment shape baked
  in — usable as a stopgap, not as a texture map.
- **The logo as vector (SVG)**. We have a 192px raster extracted from her Instagram
  avatar. Scaling that up for a full-screen brand reveal will look soft. If she has
  the original file from whoever made the label, that is the single highest-value
  asset for this intro.
- **Optional: a short clip of the machine running**, which would let the craft beat
  use her real workshop instead of an abstraction — and would suit this brand far
  better than any shader.

---

## 10. What this contract does not cover

Scene composition, camera framing, exact timings, and the per-device variants are
implementation decisions, deliberately left open. This document constrains *what the
intro may not become*; it does not design it.
