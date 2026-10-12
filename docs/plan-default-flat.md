# The first flat: four rooms the studio opens on (plan, 2026-10-09)

Status: built (2026-10-10). The flat is `showcaseFlat()` in
room-store.ts, the items and their places are `SHOWCASE` in
assets-data.ts, and showcase.test.ts reads the whole flat through the
planner's own health check. The plan below is as it was written; the
section at the end, "As built", lists where the build departed from it
and why.

## Why

Today the studio opens on one living room (the 4-room preset,
6.5 × 4.0 m) holding five pieces. Two things were asked for: the
default room should be proportionally larger, and a first visit should
show a flat of four connected rooms, a living room, a bedroom, a
kitchen and a bathroom, each furnished the way a real Singapore HDB
flat is, with the rooms arranged as a flat is and not as a chain. Some
of what stands in the rooms is Furnishes' own, there to be bought; the
rest is there so the rooms read as rooms.

## The flat

The sizes are the 5-room preset the archive's HDB profile already
records (`PRESETS["5-room"]` in room-data.ts), so "proportionally
larger" costs no new numbers: the living room grows from 6.5 × 4.0 to
7.0 × 4.5 m and the rest follow. The default flat type becomes
"5-room". The bathroom is a new room kind (there is none today):
2.4 × 1.7 m, the common bathroom the HDB conventions list describes.

Walls are 300 mm (`WALL_MM`). North is the daylight side, the top of
the sheet. Positions are the room's north-west corner on the sheet, mm.

| Room            | Kind     | Size (W × D) | Position      | Floor | Walls      |
| --------------- | -------- | ------------ | ------------- | ----- | ---------- |
| Living & dining | living   | 7000 × 4500  | (0, 0)        | Vinyl | Warm white |
| Master bedroom  | master   | 4000 × 3500  | (−4300, 0)    | Vinyl | Sage       |
| Bathroom        | bathroom | 2400 × 1700  | (−2700, 3800) | Tiles | White      |
| Kitchen         | kitchen  | 3200 × 2700  | (7300, 1800)  | Tiles | White      |

Drawn (not to scale):

```
                        north: windows
 +-------------------+--------------------------------------+
 | Master bedroom    |  Living & dining                     |
 | 4.0 × 3.5         |  7.0 × 4.5                           |
 |              door-|->                                    |
 +--------+----------+                      +---------------+
          | Bathroom |                 sliding  Kitchen     |
          | 2.4 × 1.7|<-door           door  ->| 3.2 × 2.7  |
          +----------+-------------------------+------------+
                                   entry door ^
```

The arrangement is a pinwheel round the living room, which is how an
HDB flat works: the living and dining room in the middle, the kitchen
beside the entrance, the bedroom and the bathroom off the far side.
Each neighbour touches the living room on a different wall, so no two
doorways line up and the walk from the entrance to any room crosses
the living room at a different angle.

### Openings

Every opening is set explicitly (not left to `openingsFor`), because
the showcase needs them where the plan says, not where a lone room's
convention puts them.

Living & dining

- Window, north wall, 3000 wide, centred (x 2000–5000), sill 900,
  head 2400. Wider than the 1900 default: a 7 m living room in a
  5-room flat has a wide window or a balcony opening.
- Entry door, south wall, 900 wide, 800 mm from the east corner
  (centre x 5750), hinged, swinging in. This is the HDB spot and the
  existing `hdb: true` flag applies.
- Doorway to the kitchen: a join on the east wall, sliding, 1800 wide,
  centred at sheet y 3150 (2250–4050). A glass sliding door between
  dining and kitchen is the common renovation.
- Doorway to the master bedroom: a join on the west wall, hinged door,
  900 wide, swinging into the bedroom, centred at sheet y 2450, which
  is 600 mm from the bedroom's south-east corner by the HDB rule.
- Doorway to the bathroom: a join on the west wall, hinged door, 750
  wide (the "Narrow" size), swinging into the bathroom, centred at
  sheet y 4150. The shared run is 900 mm (sheet y 3800–4500, what the
  bathroom's north edge leaves of the living room's west wall), which
  is exactly `JOIN_MIN`.

Master bedroom

- Window, north wall, 1500 wide, centred (local x 1250–2750).
- The door is the join above, on its east wall at local y 2450.

Bathroom

- Window, west wall, 600 wide, sill 1500, head 2100: the small high
  louvre window a common bathroom has.
- The door is the join above, on its east wall at local y 350.
- The bathroom also shares 2400 mm of the master bedroom's south wall;
  `settleJoins` would make a second doorway there. That join is kept
  but closed (`open: false`), so the wall stays solid: this is the
  common bathroom, entered from the living room, not an ensuite.

Kitchen

- Window, east wall, 1200 wide (the "Small" size), centred (local
  y 750–1950): the service-yard side.
- The door is the sliding join above, on its west wall at local
  y 450–2250.

## What stands in each room

Two kinds of thing, as assets-data.ts already distinguishes them:

- **Pieces** are Furnishes products from the catalogue, priced in S$,
  editable and purchasable. They carry the catalogue's sizes.
- **Room items** (kind "decor") are there so the room reads as a room:
  a sofa, a bed, a fridge. They have no price and are not for sale.

Positions are the item's footprint on the room's own floor, mm from
the north-west corner, as `x0–x1, y0–y1`; "faces" says which way its
front turns. Clearances follow the planner's rules: 600 mm walkways,
the door swings clear, nothing tall under a window.

### Living & dining (7000 × 4500)

Two zones: the lounge in the west two thirds under the window and
facing the media wall (the south wall, west of the entry door), the
dining at the east end beside the kitchen door. The entry has its own
corner.

Pieces (for sale)

| Piece                     | Size                 | Where                                                                                                                                                                   | Faces |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Three-bay sideboard       | 1800 × 400 × 800     | 1100–2900, 4100–4500 (south wall), the media console                                                                                                                    | north |
| Bookwall                  | 1200 × 400 × 1600    | 0–400, 500–1700 (west wall, north of the bedroom door)                                                                                                                  | east  |
| Storage bench             | 1200 × 400 × 450     | 4000–5200, 4100–4500 (south wall, west of the entry door): the shoe bench                                                                                               | north |
| Entry organiser           | 600 × 400 × 1200     | 6400–7000, 4100–4500 (south-east corner, east of the entry door): keys, bags, hooks                                                                                     | north |
| Folding screen (optional) | 1800 unfolded × 1200 | folded to about 1200 along y at x 3800, y 1000–2200: a zone divider between lounge and dining; leave it out if the sight line from the entry to the window matters more | west  |

Room items

| Item               | Size             | Where                                                                                      | Faces                             | Form                               |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------- |
| Sofa, three-seater | 2400 × 900 × 800 | 1000–3400, 1300–2200, its back to the window                                               | south                             | stock `sofa_02.glb`, resized       |
| Rug                | 2400 × 1600      | 1000–3400, 2300–3900                                                                       | —                                 | built form                         |
| Coffee table       | 1000 × 600 × 420 | 1700–2700, 2700–3300, on the rug                                                           | —                                 | stock `modern_coffee_table_01.glb` |
| Armchair           | 800 × 850 × 800  | 3500–4300, 2600–3450, at the rug's east end                                                | west, turned 20° toward the table | stock `modern_arm_chair_01.glb`    |
| Floor lamp         | 300 × 300 × 1500 | 500–800, 1500–1800, by the sofa's west arm                                                 | —                                 | built form                         |
| Potted plant       | 400 × 400 × 900  | 200–600, 200–600, the north-west corner in the window's light                              | —                                 | stock `potted_plant_04.glb`        |
| Dining table       | 1400 × 800 × 750 | 4600–6000, 1500–2300, long side along the window                                           | —                                 | built form                         |
| Dining chairs × 4  | 450 × 500 × 850  | 4850–5300 and 5550–6000 at y 950–1450 (north side); the same x at y 2350–2850 (south side) | toward the table                  | stock `dining_chair_02.glb`        |
| Potted plant       | 400 × 400 × 900  | 6500–6900, 200–600, the north-east corner                                                  | —                                 | stock `potted_plant_04.glb`        |

Checks: the sofa's back stands 1300 from the window wall, a walkway
behind it; the sofa front to the sideboard is 1900, a sitting-room
distance for a screen on the sideboard; the entry door's swing
(x 5300–6200, y 3600–4500) is clear, the bench ends at 5200 and the
organiser starts at 6400; the dining chairs' south row ends at
x 6000, 1000 from the east wall, so the approach to the kitchen's
sliding door (y 2250–4050) stays open; the bedroom door at the west
wall (y 2000–2900) has the bookwall ending 300 north of it and the
rug starting 1000 east of it.

### Kitchen (3200 × 2700)

An HDB kitchen is fitted: a counter run along one wall with wall
cabinets above, a fridge, and the loose pieces at the ends. The
archetype already in archetypes.ts is "the trolley at the counter's
end", which this follows.

Pieces (for sale)

| Piece              | Size             | Where                                                                                | Faces |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------ | ----- |
| Preparation island | 1200 × 400 × 800 | 600–1800, 2300–2700 (south wall): the landing and prep table                         | north |
| Kitchen trolley    | 600 × 400 × 800  | 2800–3200, 1000–1600 (east wall, under the window: 800 high sits under the 900 sill) | west  |

Room items

| Item            | Size                             | Where                                                                                     | Form                         |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| Kitchen counter | 3200 × 600 × 900                 | 0–3200, 0–600, the north wall end to end, with a sink and a hob read as insets in the top | new built form               |
| Wall cabinets   | 3200 × 350 × 700, bottom at 1500 | 0–3200, 0–350, above the counter                                                          | new built form               |
| Fridge          | 700 × 650 × 1750                 | 2400–3100, 2050–2700 (south wall, east end)                                               | new built form               |
| Stools × 2      | 350 × 350 × 650                  | 800–1150 and 1300–1650 at y 1900–2250, tucked at the island                               | stock `metal_stool_01.glb`   |
| Wicker basket   | 350 × 350 × 300                  | 1950–2300, 2350–2700, between the island and the fridge                                   | stock `wicker_basket_01.glb` |

Checks: counter front (y 600) to the island front (y 2300) is 1700,
with the stools taking 350 of it, a 1350 working aisle; the sliding
door on the west wall (y 450–2250) opens onto that aisle with nothing
in front of it; the trolley stands 100 from the counter's east end.

### Master bedroom (4000 × 3500)

The archetype is "the bed on the longest wall". The 5-room guidance
says a king is comfortable and a queen leaves room for a bench at the
foot; the showcase takes the queen with the bench, because the bench
is a Furnishes piece. A desk at the window does not fit a 3.5 m deep
room with the bed along the depth (600 desk + 500 chair + 600 walkway

- 2100 bed is 3800), so there is none; the archetype's desk rule
  simply finds no desk.

Pieces (for sale)

| Piece                  | Size             | Where                                                                       | Faces |
| ---------------------- | ---------------- | --------------------------------------------------------------------------- | ----- |
| Bedside cabinet (west) | 600 × 400 × 400  | 550–1150, 3100–3500                                                         | north |
| Bedside cabinet (east) | 600 × 400 × 400  | 2850–3450, 3100–3500                                                        | north |
| Storage bench          | 1200 × 400 × 450 | 1400–2600, 950–1350, at the foot of the bed                                 | north |
| Desk-side organiser    | 600 × 400 × 1200 | 3600–4000, 200–800 (east wall by the window): the dressing-corner organiser | west  |

Room items

| Item         | Size                                    | Where                                             | Form                                 |
| ------------ | --------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| Queen bed    | 1600 × 2100 × 450 (headboard 1000 high) | 1200–2800, 1400–3500, headboard on the south wall | built bed form                       |
| Wardrobe     | 600 × 2000 × 2200                       | 0–600, 200–2200, along the west wall              | new built form (two doors, a plinth) |
| Potted plant | 400 × 400 × 900                         | 700–1100, 150–550, in the window's light          | stock `potted_plant_04.glb`          |

Checks: the wardrobe's doors open onto a 600 walkway to the bed's
west side; the door swings in at the east wall (y 2000–2900, arc to
x 3100), the bed ends at x 2800 and the east bedside sits south of the
arc at y 3100; the bench stands 950 from the window wall.

### Bathroom (2400 × 1700)

A common HDB bathroom: shower at one end behind a glass screen, the
WC and basin along the walls, the door swinging in at the other end.
Everything here is a room item except the trolley.

Pieces (for sale)

| Piece                                 | Size            | Where                                                            | Faces |
| ------------------------------------- | --------------- | ---------------------------------------------------------------- | ----- |
| Kitchen trolley, as the towel trolley | 600 × 400 × 800 | 2000–2400, 1100–1700 (south-east corner, outside the door's arc) | west  |

Room items

| Item                      | Size                                      | Where                                                        | Form                                                    |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Shower screen             | 900 along y × 10 × 2000                   | at x 900, y 0–900: the glass panel closing the shower corner | new built form (glass)                                  |
| Basin cabinet with mirror | 600 × 450 × 850; mirror 600 × 800 at 1100 | 1200–1800, 0–450 (north wall)                                | new built form; the mirror uses the existing MirrorFace |
| WC                        | 380 × 700 × 780                           | 1000–1380, 1000–1700 (south wall)                            | new built form                                          |
| Bath mat                  | 600 × 400                                 | 950–1550, 400–800, at the shower's mouth                     | the rug form, small                                     |
| Wicker basket             | 350 × 350 × 300                           | 1500–1850, 1350–1700, beside the WC                          | stock `wicker_basket_01.glb`                            |

Checks: the door is on the east wall at y 350 (local), 750 wide,
swinging in: its arc is x 1650–2400, y 0–750, which the trolley (from
y 1100) and the basin (to x 1800, at y 0–450: the arc's inner corner
at x 1650 passes 150 outside the basin's east edge — move the basin to
1100–1700 if the health check flags it) leave clear.

## Pieces for sale in the showcase

Ten pieces, from seven of the catalogue's recipes: Three-bay sideboard,
Bookwall, Storage bench ×2, Entry organiser, Preparation island,
Kitchen trolley ×2, Bedside cabinet ×2, Desk-side organiser, and the
optional Folding screen. Not shown: Work cart, Organiser workstation,
Mobile screen, Coat stand. The Products tab still offers all of them.

## New forms needed

Room items drawn by what they are, in Furniture3D.tsx, as boxes and
cylinders in the existing finish palette (no new files, no new
dependencies): kitchen counter with a sink and hob inset, wall
cabinets, fridge, wardrobe, shower screen (glass material), basin
cabinet with a mirror, WC. The stock mapping gains "chair" →
`dining_chair_02.glb`, "stool" → `metal_stool_01.glb` and "basket" →
`wicker_basket_01.glb` (all already under public/props, CC0).

## The first view and the tour

The first view stays at eye level in the living room, from inside the
entry door looking north-west across the lounge to the window. The
default tour stops: entry → lounge → dining → kitchen → bedroom door →
bedroom → bathroom door, so Play walks the pinwheel.

## Implementation notes (in order)

1. room-data.ts: add `"bathroom"` to `ROOM_IDS`, `ROOM_NAMES`
   ("Bathroom"), `PRESETS` (2400 × 1700 in every flat; 3-room keeps it
   too), `PRIVATE_ROOMS`, `FIT_FOR_ROOM` (none), `openingsFor` (door
   east, small high window west), the archetype in archetypes.ts
   ("the trolley by the basin": a trolley on a free wall), `rulesFor`.
   The `Record<RoomId, …>` types will list every other place to fill.
2. room-store.ts: replace the single `first` room with a
   `showcaseFlat()` that builds the four rooms at the positions above,
   runs `settleJoins`, then sets the kitchen join to sliding 1800 and
   closes the master–bathroom join. `flat` defaults to "5-room".
3. A `showcase.ts` table of `{ productId | decor, roomId, x, y, turn,
size? }` for every item above, applied with `placeAll` when a
   project is new (overrides empty). Decor sizes that differ from the
   name defaults (the 2400 sofa, the 2400 × 1600 rug, the 600 × 400
   bath mat) go in the table.
4. Furniture3D.tsx: the new built forms and the stock mapping.
5. Tour stops and the first camera for the four-room sheet.
6. Tests: a unit test that the showcase has no room overlaps, every
   join as specified, every item inside its room and no clashes
   (room-health); an e2e check that a first visit shows four rooms by
   name; every visual baseline re-taken on purpose (the picture is a
   different flat); the first-load budget re-run.
7. Saved projects keep their rooms: the showcase seeds new projects
   only, with the sync document's version bumped.

## As built

The planner's health check (`healthOf`, the same one Eva's room health
reads) was run over the plan's positions, and the first pass raised a
dozen findings. Each was answered by moving something, never by
loosening a rule:

- **The bedroom stands a metre north of the living room's line**, at
  (−4300, −1000), and the bathroom at (−2700, 2800), flush with the
  living room's south line. At the plan's positions the bathroom met the
  living room's west wall over 700 mm, under the 900 mm a doorway
  needs; now it meets it over 1700. The flat's outline has a jog at the
  north-west, as flats do.
- **The doorways, on the sheet**: the bedroom's door is centred at
  y 1450 (600 mm from the bedroom's south-east corner, as planned, which
  is y 1000–1900 on the living room's west wall); the bathroom's at
  y 3325, the north end of the shared run, so its swing (x 1650–2400,
  y 150–900 in the bathroom) clears the trolley; the kitchen's sliding
  door at y 3450 (2550–4350), not 3150, so the counter along the
  kitchen's north wall stands clear of the doorway's approach.
- **The bookwall moved to the north wall**, east of the window
  (x 5200–6400), because the west wall now carries two doors and their
  approaches, with no 1200 mm run free between them.
- **The entry organiser stands on the east wall** north of the sliding
  door (x 6600–7000, y 1000–1600): the south-east corner holds the
  entry door's swing and the sliding door's approach, and nothing fits
  between them.
- **The floor lamp stands at the sofa's east arm** (x 3450–3750), out of
  the bedroom door's approach; the coffee table is 600 from the sofa
  (not 500); the dining set is 100 further east; the dining chairs are
  450 × 480 so the planner reads them as small things walked round,
  tucked at the table, rather than as neighbours owed a walkway.
- **In the kitchen** the fridge stands beside the island (x 1800–2500,
  touching), the trolley at y 1200 (a walkway from the counter), the
  basket beside the trolley.
- **In the bedroom** the bedside cabinets touch the bed (x 600–1200 and
  2800–3400); the bench touches its foot.
- **In the bathroom** the basin touches the shower screen (x 910–1510)
  and the WC is 650 deep at y 1050, a walkway from the basin.
- **Eleven pieces for sale**, not ten (the count in the plan was short):
  sideboard, bookwall, entry organiser, two storage benches, preparation
  island, two kitchen trolleys, two bedside cabinets, desk-side
  organiser. The folding screen was left out: it would have stood in
  the sight line from the entry to the window.
- **Two categories were added** for the room items that had no home:
  "Beds" and "Kitchen & bath fittings" (the counter with its wall
  cabinets, the fridge, the basin cabinet with its mirror, the WC, the
  shower screen). The wall cabinets are part of the counter's form, not
  an item of their own, so the plan does not read them as a second
  thing standing on the counter's floor.
- **The tour's default stops** walk the pinwheel: in at the entry,
  through the lounge and the dining end, into the kitchen and back,
  across to the bedroom and back, and to the bathroom door, every
  doorway crossed square on.

The health check now reads every room clean: no overlaps, every door's
swing and approach clear, every window clear of tall pieces, every gap
between neighbours a walkway or a touch, nothing a room must have
missing. The e2e suite's expectations of the old single room (its size,
its flat type, where its pieces stood on the plan) were brought up to
the flat.

### What the flat showed up in the studio

Four rooms open from the start exercised paths a single room never
did, and five of them were wrong:

- **Switching the flat type** rebuilt every preset room's openings from
  a lone room's convention and never re-read the doorways: the kitchen
  lost its window, the bedroom got back a door into the bathroom. A
  preset room now keeps its openings, refitted to its new size (one
  placed by HDB's convention stays as far from its corner, the rest
  keep their share of the wall), and the doorways are settled again.
  The rooms take the new flat's sizes and are stood back against the
  rooms they are joined to (`restand`: each shared wall fixes one way
  of a room, across or down, from the living room out), so the flat
  keeps together; a doorway that no longer fits where it stood is
  moved into what is shared and narrowed to it, its kind and its
  closed wall kept, instead of a new passage taking its place. The
  pieces keep their places in their rooms, so in a smaller flat some
  stand past a wall and the planner offers a Fix for each.
- **Eva knew a piece only by its name.** A second of a kind is
  numbered ("Kitchen trolley 3"), so she offered again what the room
  already had, and a card's "In the room" never lit for a piece added
  from it. Her picks and the card now match by product too.
- **The tour's stops** were drawn faded over every plan while the Tour
  tool was off; the flat's default round of thirteen stops took the
  clicks meant for the rooms' floors. They are drawn while the tool is
  on.
- **A piece shown alone** (Details) stood alone only in its own room;
  the plan kept drawing the other rooms' pieces round it.
- **Picking a piece in another room** makes that room the one worked
  on, as it did before; with four rooms it happens often, and Eva's
  labels and room line follow the room picked.

- **The first view** framed the middle of the whole flat from 18 m
  away, so the four rooms read as a thin strip. The plan put it inside
  the entry door; at the camera's 42° that shows a sliver of the room,
  and an open top seen from inside reads as a cut-away. It stands where
  a single room's did: at eye level just past the room's south-east
  corner, looking across the room being worked on. The overviews still
  frame the whole flat, the front and back a little further back so its
  near corners stay in the picture. Walk is the view from inside.
- **A wall two rooms share** stood full height whatever the camera did,
  since it is always one room's inside; from outside the living room
  the kitchen's wall hid a third of it. A shared wall and its doorway
  now answer to the room being worked on: its near wall is cut or goes,
  its far wall stands, and it stands when neither room is.

- **What the flat costs to draw.** Furnished, the flat drew 766 times
  a frame (519 meshes, 247 outlines) and 284k triangles, before each
  shadow light drew it again. The bookwall took 238 of those draws, two
  a book; a shelf's books are now one merged mesh, and the flat draws
  528 times and 254k triangles. Most of what is left are the stock
  props' triangles (each dining chair about 22k, each wicker basket
  about 22k) and the panels' outlines, one draw a panel. On the
  sandbox's software renderer the page was held 50 s of its first
  minute and is held 29 s now; a real GPU draws this easily, but it
  has not been measured on a phone.
- **Batched pieces and lighter props** (docs/plan-draw-cost.md). A
  built piece's boards, rods and their joint lines are merged a finish
  at a time (`Built`, part-geometry.ts), so a carcass of twenty boards
  is two or three meshes and not forty draws; the stock models over
  about 8k triangles are simplified to about 6k. The flat now shows
  254 meshes (387 before), 50 outlines (141), 198 shadow casters (331)
  and 150k triangles (254k). The page's first minute in the sandbox is
  held 21.5 s (28.4 s just before): what holds it is building the
  shaders (22 programs, each 0.4–0.7 s in the software renderer), not
  drawing. They are now built ahead of the frame, a part at a time
  (shader-warm.ts): the first minute is held 15–17 s against 23–24 s
  without, and the longest freeze is 5–7 s against 12 s; on a device
  with parallel shader linking or WebGPU the builds leave the main
  thread altogether. Building them in order showed that the Full
  picture had never taken the light probes' light (the materials were
  built before the grid had its first picture); it does now, and the
  visual pictures were taken again for it.

Saved projects keep the rooms they were saved with; only a new project
opens on the flat. The snapshot's shape did not change (a room kind and
two categories were added), so its version stands.

## The 5-room flat (three bedrooms, two bathrooms)

The flat above took the 5-room preset's sizes but only four of its
rooms: a living room, one bedroom, a kitchen and a bathroom. An HDB
5-room flat is named for its five rooms, three bedrooms and the living
and dining room, and it has two bathrooms, the common one and the
master's own. The flat as it opens is now that flat: the four rooms
stay where they stand, and three more join them. (Positions are each
room's north-west corner on the sheet, mm; the living room is the
origin.)

| Room              | Kind      | Size (W × D) | Position       | Floor | Walls      |
| ----------------- | --------- | ------------ | -------------- | ----- | ---------- |
| Living & dining   | living    | 7000 × 4500  | (0, 0)         | Vinyl | Warm white |
| Master bedroom    | master    | 4000 × 3500  | (−4300, −1000) | Vinyl | Sage       |
| Bathroom (common) | bathroom  | 2400 × 1700  | (−2700, 2800)  | Tiles | White      |
| Kitchen           | kitchen   | 3200 × 2700  | (7300, 1800)   | Tiles | White      |
| Bedroom 2         | bedroom-1 | 3000 × 3000  | (−1700, 4800)  | Vinyl | Sand       |
| Bedroom 3         | bedroom-2 | 3000 × 3000  | (1600, 4800)   | Vinyl | Warm white |
| Master bathroom   | ensuite   | 1600 × 2000  | (−4600, 2800)  | Tiles | White      |

```
                          north: windows
  +-------------------+--------------------------------------+
  | Master bedroom    |  Living & dining                     |
  | 4.0 × 3.5         |  7.0 × 4.5                           |
  |              door-|->                                    |
  +-door-+------------+                      +---------------+
  |Master| Bathroom   |                 sliding  Kitchen     |
  | bath | 2.4 × 1.7  |<-door           door  ->| 3.2 × 2.7  |
  |1.6×2 +---+--------+--door---+--door------+---+------------+
  +------+   | Bedroom 2        | Bedroom 3  |   ^ entry door
             | 3.0 × 3.0        | 3.0 × 3.0  |
             +------------------+------------+
                        south: windows
```

Ten joins: five doorways off the living room (the master's door, the
common bathroom's, the kitchen's 1.8 m sliding door, and one 800 mm door
into each common bedroom), the master bathroom's 700 mm door from the
master alone, and four walls that stand closed.

Why this arrangement:

- **The two bedrooms open off the living room's south wall**, west of
  the entry door. An HDB flat reaches its bedrooms from the living room
  or a short passage off it, and the studio's rooms meet only wall to
  wall, so the living room is the passage. Bedroom 2 hangs west past the
  living room's corner so the entry door keeps its place 800 mm from the
  east corner, and each bedroom has its own south window.
- **The master's bathroom is under the master bedroom's west end**,
  entered only from it, through a door 100 mm from the bedroom's
  south-west corner whose leaf swings into the bathroom. The two
  bathrooms stand back to back, as their pipes would, with the wall
  between them closed. It is a room kind of its own (`ensuite`, named
  "Master bathroom"), with a bathroom's rules and openings, so the Room
  tab, Eva and the planner read it as the master's and not as a second
  common bathroom.
- **Closed walls:** bedroom 2 to bedroom 3, bedroom 2 to the common
  bathroom, the master to the common bathroom, and the two bathrooms.
  Each stands solid, so the only way into a bedroom is its own door.

What goes in the new rooms (★ Furnishes pieces, to be bought; the rest
is there so the room reads as a room). Every room passes the planner's
rules as it opens (showcase.test.ts): no overlaps, the doors' swings and
the windows clear, 600 mm walkways, what the room must have.

- **Bedroom 2, a child's room:** a single bed with its head on the west
  wall and a ★ bedside cabinet against it, a wardrobe and a study desk
  side by side on the south wall (the desk under the window) with its
  chair, and a ★ desk-side organiser on the east wall, clear of the
  door's swing.
- **Bedroom 3, a study and guest room:** a ★ organiser workstation on
  the east wall with its chair, a daybed along the west wall, a ★ work
  cart against the workstation's end, a plant in the corner past the
  door.
- **Master bathroom:** a shower behind its screen in the south-west
  corner, a basin cabinet on the east wall with the WC beside it, a ★
  trolley for towels on the west wall clear of the door, a bath mat.
- **The master bedroom makes room for its new door:** the bed, its
  bedside cabinets and the bench at its foot move 200 mm east, so the
  west cabinet clears the bathroom doorway and the bed still clears the
  swing of the door from the living room.

Changing the flat type keeps the flat together as far as the type's
sizes allow. As a 4-room flat every doorway stays; its master was
3.5 m wide in the presets and is now 3.6 m, the least that still
reaches past the common bathroom to the master's own with a doorway
between them. A 3-room flat has one common bedroom, so bedroom 3
becomes a room of the living room's kind (as any room a type does not
have), and its 3.0 m master is too narrow to stand over both bathrooms:
the master bathroom stands apart from the bedroom until it is moved or
the master widened.

The first view had stood beyond the living room's open south-east
corner, which is now bedroom 3: its workstation and cart filled the
foreground. It now stands inside the living room, in its south-west
corner (the side facing its window, away from its doors), and looks
across it as a photograph of a room is taken, with the window, the
bookwall and the entry organiser in view (`docs/plan-realism.md`, "The
room from its corner"). The tour adds the two bedrooms and
the master's bathroom to its round (21 stops). Saved projects keep their rooms; only a new project opens on
this flat. The cost to draw grows with the rooms: the bench's opening
lines and the probes above say what it costs on a given device.

## Re-laid after a family apartment planner (2026-10-12)

A family apartment planner (an interactive Three.js page of a Singapore
5-room flat for two parents and three children) was read for its plan
and its furniture, and the showcase flat re-laid after it. The page
was read as data: its room rectangles, its furniture lists and its
three layouts for the children's rooms.

What the planner does that the earlier flat did not:

- **The bedrooms and bathrooms open off a hall, not off the living
  room.** A 0.7 m bedroom hall runs west from the living room; the
  three bedrooms stand along its north side, the two bathrooms and the
  household shelter along its south side. The living room keeps its
  walls for the sofa, the television and the dining table.
- **The kitchen runs across the south of the flat** behind the living
  room, reached through a wide opening, with the service yard at its
  west end and the entrance in the south-east corner of the living room.
- **The rooms an HDB flat has that a plan of the main rooms leaves
  out:** the household shelter (the bomb shelter every HDB flat has,
  used as a store) and the service yard (the washer and the drying
  rack).
- **The living room is a family room:** a sofa facing a media console
  on the east wall, a coffee table on a rug, a lounge chair, a four-
  seat dining table by the kitchen with a sideboard, a shoe cabinet by
  the door, and a three-seat homework desk under the window, the
  "shared study" the planner puts in the living room so the children
  work where they are seen.
- **The children's rooms:** two children share a room with a bunk bed,
  wardrobes and a rug; the third has a single bed, a desk and a
  wardrobe. The parents' room has a queen bed between two bedside
  cabinets and a wardrobe.

The studio's flat now has ten rooms. Rooms are rectangles with 300 mm
walls, so the planner's 0.7 m hall becomes 1.1 m (the least a door
off it opens into comfortably) and the sizes are rounded to the
planner's 50 mm grid. Positions are each room's north-west corner on
the sheet, mm.

| Room              | Kind      | Size (W × D) | Position     | Doorway                       |
| ----------------- | --------- | ------------ | ------------ | ----------------------------- |
| Living & dining   | living    | 5700 × 6300  | (9600, 0)    | entry door, south wall        |
| Kitchen           | kitchen   | 5000 × 2400  | (7700, 6600) | 1.8 m slider from the living  |
| Master bedroom    | master    | 3000 × 3800  | (0, 900)     | door from the hall's west end |
| Bedroom 2         | bedroom-1 | 2700 × 3400  | (6600, 0)    | door from the hall            |
| Bedroom 3         | bedroom-2 | 3000 × 3400  | (3300, 0)    | door from the hall            |
| Bathroom          | bathroom  | 2300 × 1700  | (3300, 5100) | 750 door from the hall        |
| Bathroom 2        | bathroom  | 1500 × 1700  | (5900, 5100) | 700 door from the hall        |
| Hall              | hall      | 6000 × 1100  | (3300, 3700) | 1.0 m opening from the living |
| Household shelter | shelter   | 1600 × 1200  | (7700, 5100) | door from the hall            |
| Service yard      | yard      | 1500 × 1900  | (5900, 7100) | door from the kitchen         |

Every other shared wall stands closed, so each bedroom and bathroom is
reached only by its own door from the hall. Hall, shelter and yard are
new room kinds in room-data.ts (sizes for the 3-, 4- and 5-room
types, no windows for the hall and the shelter, a screened opening for
the yard), with an archetype each and Eva's bands for what they hold.

What stands in each room (★ Furnishes pieces; the rest are room
items). Every room passes the planner's rules as it opens
(showcase.test.ts): nothing over another, the doors' swings and the
windows clear, 600 mm walkways, what the room must have.

- **Living & dining:** ★ bookwall on the west wall, ★ sideboard on the
  south wall by the dining table, ★ entry organiser by the door; the
  sofa (2.4 m) facing east to a TV console with its television, a rug
  under the coffee table, an armchair, a floor lamp and a plant; a 2.2
  m homework desk under the north window with three chairs; a dining
  table for four.
- **Kitchen:** the counter with its wall cabinets along the south wall,
  the fridge and a ★ kitchen trolley on the north
  wall clear of the slider.
- **Master bedroom:** a queen bed with its head on the north wall
  between ★ two bedside cabinets, a 2 m wardrobe on the south wall, a
  plant.
- **Bedroom 2 (one child):** a single bed against the east wall with a
  ★ bedside cabinet, a study desk on the west wall with its chair, a
  wardrobe on the south wall clear of the door.
- **Bedroom 3 (two children):** a bunk bed on the west wall with a ★
  bedside cabinet, a wardrobe across the room, a rug.
- **Bathroom:** a shower behind its screen in the south-east corner
  under the window, the basin cabinet on the west wall with the WC
  beside it, a ★ towel trolley, a bath mat.
- **Bathroom 2:** the basin cabinet and the WC, a ★ towel trolley.
- **Household shelter:** ★ shelving on its back wall.
- **Service yard:** a washing machine and a ★ work cart.
- **Hall:** kept clear.

New forms: a bunk bed (posts, two decks and mattresses, a guard rail
round the upper deck and a ladder at its foot), a TV console (a two-
door carcass on a plinth with a television standing on it) and a
washing machine (a white box with its drum's door and a control strip),
in Furniture3D.tsx and as plan symbols; sizes by name in
piece-detail.ts.

Changing the flat type no longer resizes the showcase's rooms: their
sizes are set from the plan, as a visitor's typed sizes are, so a 3-
or 4-room type changes the rooms' kinds (bedroom 3 becomes a living
room in a 3-room flat) and keeps every room where it stands and every
doorway. Before, the rooms followed the type's sizes and were stood
back together, which a ten-room plan packed wall to wall does not
survive. The start-over version is 4, so a browser that kept the
earlier flat opens on this one.

### Three arrangements, three projects (2026-10-12)

The planner offers more than one way to furnish the children's rooms
and the living room, and those now open as projects of their own in
the project menu, each a full flat (`ARRANGEMENTS` in assets-data.ts,
`showcaseProjects()` in project-store.ts); the start-over version is 5.

- **HDB 5-room · Balanced** — the flat as above, with fewer repeated
  pieces than the first lay-out (one desk chair per desk, a bench at
  the foot of bedroom 3's bunk instead of a second rug, the bathrooms'
  trolleys gone) and no dark chairs: a plain chair is drawn as the
  studio's own light form, never the dark stock model.
- **HDB 5-room · Study-focused** — the living room gives its rug to a
  learning library on the west wall; bedroom 3 has a two-child study
  desk under its window with two chairs; the bedrooms and the living
  room in white.
- **HDB 5-room · Leisure** — the homework desk and its chairs leave the
  living room for a leisure bench and a reading armchair; bedroom 3 has
  a play table and bedroom 2 a bean bag; parquet floors, sand walls in
  the living room and sage in the bedrooms.

Every arrangement passes the same rules as it opens (showcase.test.ts:
nothing over another, doors and windows clear, walkways, what each
room must have), and no two are the same.

### Arranging a piece, and the walls (2026-10-12)

The turn ring with its knob in 3D and the turn handle on the plan read
as nothing to most people, and a drag fired more store writes than the
screen draws. A picked piece now carries a labelled bar over it in both
views (PieceBar.tsx): its name and "drag to move", a quarter turn either
way about its middle, its degrees typed, Against wall (its back to the
nearest wall, flush), Duplicate and Remove; while it is dragged, its
distance to the walls shows in the bar's place. The keys follow it: R
and Shift R, [ and ] by 15° (Shift, 1°), the arrows by 50 mm (Shift,
10 mm). Moves and turns land once a frame and the orbit has damping.

Each room also has what hangs on its walls, outlets included, suggested
for its kind and editable in the Room tab's On the walls (see "What
hangs on the walls" in plan-realism.md).
