# The Furnishes pieces in 3D: one family, thirteen uses (2026-10-12)

The question asked: which of the modular designs are not really good,
in particular the ones that look like another made shorter or taller,
and what would make each read as a real piece. They should not differ
too much (they are one system), but each should be recognisable.

## What was wrong

Every storage recipe went through one function, `Carcass`, at its own
size: a recessed 60 mm plinth, sides, a top and a bottom, shelves by
height (1 shelf over 600 mm inside, 3 over 1200 mm), hooks on any
organiser. So:

| Recipe                                    | Drawn as                      | Problem                                                            |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Entry organiser, 600 × 1200               | carcass, 1 shelf, hooks       | the same box as the next two                                       |
| Desk-side organiser, 600 × 1200           | carcass, 1 shelf, hooks       | identical to the entry organiser                                   |
| Mobile screen, 600 × 1200                 | carcass, 1 shelf, on a plinth | identical again, and not mobile                                    |
| Coat stand, 600 × 1600                    | carcass, 3 shelves, hooks     | a taller entry organiser; no rail                                  |
| Kitchen trolley, 600 × 800                | iron posts and three boards   | not plywood at all; same as the next                               |
| Work cart, 600 × 800                      | iron posts and three boards   | identical to the trolley                                           |
| Preparation island, 1200 × 800            | a wider cart                  | not two bodies under one top                                       |
| Organiser workstation, 1200 × 1600 × 1000 | a solid carcass 1 m deep      | no desk at all                                                     |
| Folding screen, 1800 × 1200               | one flat slab on two feet     | no leaves, no fold                                                 |
| Bench, bookwall, sideboard, bedside       | carcass variants              | broadly right, but the bookwall had a back and books one side only |

The add-ons chosen in Customise (hooks, tray, utility hook, rails) never
reached the 3D at all, and there was no charging option, though the
planner the flat follows has a family command sideboard where the
tablets charge.

## What the record says

The assembly record (`packages/domain/src/parts.ts`), which the parts,
steps and price already read, describes the pieces differently from the
old drawing, and is what the house's portraits show:

- each bay is a 600 × 400 unit with **its own two sides**, so two bays
  meet in a doubled side;
- the stacked family's sides are **a panel a 400 mm tier**, the
  full-height family's one panel;
- the back is the **functional panel**, a panel a tier; on the bookwall
  it stands **in the middle**, with narrow shelves either side;
- every bay stands on a **base**: a 28 mm foot base on pads, or a caster
  base on **four castors** for the trolley, the screen and the island;
- the shelves are the recipe's own: the entry organiser's shoe shelf at
  240 mm and a narrow shelf set back at 780 mm; the coat stand's one
  shelf at 300 mm; the other organisers' at 430 and 770 mm; the
  stacked pieces' at each tier;
- the workstation is an organiser tower with a desk surface across its
  front at 720 mm, on brackets at the tower and a panel support at the
  far end;
- the folding screen is three leaves of two stiles and a panel a tier,
  joined by continuous hinges.

## The plan, and what was built

Every Furnishes piece is now drawn by `furnishes-forms.ts` (plain data,
tested in `furnishes-forms.test.ts`) from its record, so the 3D, the
bill of parts and the price describe the same object. The shared
language keeps them one family:

1. birch panels with their edges showing; a darker base under every
   piece, the body set 12 mm in on it, with the house's two orange
   connector marks on its front;
2. bays with their own sides (the doubled side between bays shows),
   tier joints on the stacked pieces' sides, the functional panel a
   panel a tier;
3. a door is an overlay panel with a **finger pull**, never a metal bar;
4. the orange is used only for connectors, hooks and hinges.

What tells them apart is what each is for, from its record and from
use, with a few things in it in four quiet tones (charcoal, cream,
sage, stone) and the orange:

| Recipe                | Now                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Entry organiser       | low shoe shelf with shoes, narrow shelf set back with a box, hooks under it with two bags, the tray on top                 |
| Desk-side organiser   | shelves at 430 / 770 mm, files, a closed box below, the functional panel's hole grid above, headphones on the utility hook |
| Mobile screen         | on castors, a closed back face side to side (the quiet side), boxes on the storage side                                    |
| Coat stand            | one low shelf with a box, the open height over it with a rail and two coats                                                |
| Kitchen trolley       | on castors, a board and a jar on the worktop, jars on the shelf, a basket below, a towel on the side rail                  |
| Work cart             | on castors, a push handle across one end, a tool box, bins and a tall container                                            |
| Preparation island    | two trolley bodies (eight castors) under one long worktop                                                                  |
| Organiser workstation | the tower at the back, the desk across the front on a panel leg, orange brackets, a laptop, the hole grid over the desk    |
| Folding screen        | three leaves at a 30° fold (the record's 300 mm depth), stiles and tier panels, orange hinges                              |
| Bookwall              | a middle panel, narrow shelves either side, books both sides                                                               |
| Sideboard             | three bays, doors optional, books, boxes and a basket when open                                                            |
| Bedside cabinet       | one open cube on a foot base, a door optional, books inside                                                                |
| Storage bench         | a 25 mm seat over two open bays, a basket and shoes                                                                        |

The add-ons chosen in Customise are drawn where they go: three orange
hooks under a shelf, the tray, the utility hook with headphones, the
side rail with a towel, the clothes rail with coats, and the new
**charging dock**: a block on the top at the far end with two tablets
and a phone standing in its slots and a small charging light, offered
on the sideboard, the bedside cabinet, the entry and desk-side
organisers and the workstation, and on in the living room's sideboard
from the start.

## What was left as it was

- The room items (sofas, beds, the kitchen, the bathroom) keep their
  forms; this pass is the Furnishes pieces.
- A piece opened as panels is still drawn from its panels.
- The plan's symbols are unchanged.
- A Mirror finish still lays a reflector on each door, from the form's
  door faces.

## The room items, after (2026-10-12)

A look at every room item side by side showed three out of step with
the rest, all now drawn with the built forms the rest share:

- the sofa was the stock tufted Chesterfield, a period piece among
  plywood and linen: it is the built seat now, linen cushions on a low
  base with slim legs, taking the room's colour;
- the coffee table was the stock near-square side table fitted to a
  1000 × 600 table, so it stood a third of its size: it is the built
  table now, the dining table's light wood and legs, low;
- the double and single beds stood on a dark-brown block beside a
  light-wood bunk: their frame is the light wood now, on a darker
  recessed plinth as the Furnishes pieces stand on their base.

The armchair, the plant, the vase and the desk lamp keep their stock
meshes: they sit with the rest. The wardrobe, the media console and
the kitchen and bathroom fittings keep their quiet laminate and white,
so the pieces for sale stand out against them.
