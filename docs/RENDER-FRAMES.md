# Render spinner frames

The `?view=render` view is a frame-sequence spinner. It plays a list of stills, dragged left and right like a turntable, with an SVG backlight for each block and for each residential floor. The two images shipped today (`view-07`, `view-04`) are **stop-frames** only. They are not a 360° turn. Intermediate frames from the schematic Three.js model were not inserted: that model does not share the render camera, and putting it between the photographs would break the illusion.

The viewer reads `public/data/render-frames.json`.

```json
{
  "floorMin": 6,
  "floorMax": 36,
  "frames": [
    {
      "id": "f018",
      "src": "renders/spin/day/f018.webp",
      "small": "renders/spin/day/f018-960.webp",
      "thumb": "renders/spin/day/f018-thumb.webp",
      "w": 2560,
      "h": 1440,
      "stop": false,
      "placeholder": false,
      "focal": [0.5, 0.42],
      "label": { "ka": "…", "en": "…" },
      "blocks": { "I": [[x, y], "..."], "II": [], "III": [], "IV": [] }
    }
  ]
}
```

Optional per-frame fields:

- `mode: "night"` puts the frame in the night set (default is day).
- `only: "wide" | "narrow"` limits the frame to screens of 820 px and wider, or narrower. Desktop opens on `aerial-day` (1600×900, the same size as the courtyard still); phones keep the portrait `view-07`.
- `floorK` bends the floor slicing: positive when the camera looks up from the ground (upper floors thinner, default 0.32), negative for aerial shots (`-0.2`).

Trace the **facade only**, from the roof rim down to the podium. A polygon that includes the roof or the neighbours makes the floor bands land on the wrong pixels (this was the night-view bug fixed on 16.11.2026).

`blocks` polygons are in **source-image pixels**, the same coordinate system as `w` × `h`. The viewer slices each polygon into floors 6–36. A frame may omit a block that is not visible. `stop: true` marks a frame the arrows can rest on (a hero angle). `placeholder: true` shows a “placeholder” chip and should not be used for a final delivery.

## What the render studio delivers

One orbit, day, and optionally the same orbit at night.

- **36 frames minimum, 72 preferred**, one full 360° around the complex.
- **Fixed camera.** Same target (the centre of the four towers), same height, same distance, same lens for every frame. Do not dolly, crane, or change focal length between frames. A 50 mm-equivalent lens at roughly the height of floors 8–12 is the intended product view, so balcony lines stay readable.
- **Even steps.** Frame `i` is yaw `i * (360 / N)` degrees. Name files `f000`, `f001`, … in yaw order, clockwise when seen from above.
- **Resolution.** At least **2560 px** on the long side, sRGB, WebP (quality ~80) plus a 960 px wide version and a ~320 px thumb. No people, cars, or text baked into the facade.
- **Same framing every frame.** The podium and all four towers stay fully inside the frame, with a little sky above the roofs. Do not crop a tower at the frame edge except where the orbit naturally occludes it behind another tower.
- **Night** (optional) is the same cameras as day, so day frame `f018` and night frame `f018` share polygons.

## Masks, so polygons do not have to be traced by hand

For every frame, four full-frame renders in addition to the beauty pass. Same camera, no anti-aliasing, no motion blur, no depth of field.

| Pass | File | Content |
| --- | --- | --- |
| Beauty | `f018.webp` | The photograph the user sees |
| Block ID | `f018-block.png` | Flat colour, one colour per block: I `#ff0000`, II `#00ff00`, III `#0000ff`, IV `#ffff00`. Everything else black. |
| Floor ID | `f018-floor.png` | Greyscale, pixel value = floor number (6–36). Podium, sky, and ground are 0. |
| Coverage | `f018-cover.png` | White where a residential facade is visible, black elsewhere. |

A script can then trace the block-ID regions into `blocks` polygons and, where a floor band is needed explicitly, clip the floor-ID pass. Until those passes exist, the viewer keeps slicing the hand-traced block polygon.

## Mapping used for the two stop-frames we have

These are hand traces, not mask passes.

**view-07** (portrait, four towers). Confidence:

- **I — high.** The only rectangular tower in the model (`shape: rrect`, east end of the site) and the only rectangular tower in the picture, on the left.
- **II — high.** The oval immediately beside I. In the site plan II is the oval closest to I.
- **III — medium.** The next oval to the right. The plan order going west from I is II, then III, then IV, and the picture reads in that order. The render camera is not a surveyed match to the plan, so III and IV could be swapped.
- **IV — medium.** The rightmost oval, same reasoning.

**view-04** (courtyard close-up). Only two masses are in frame, both curved, and the tops are cropped.

- Centre tower marked **II — low.** It is an oval seen from the garden, not the rectangular block, and II is the oval nearest the courtyard edge of the plan. This is a best guess.
- Right-hand sliver marked **III — low.** The other visible oval. I and IV are not in this frame.

Replace both traces as soon as a real ID pass exists. Do not hand-edit prices, statuses, or apartment counts in this pipeline; the viewer reads those from `apartments.json`.
