import { designOf, recipeFromWords } from "@furnishes/domain";
import { sgd } from "./assets-data";
import { useDemo, type DemoAct } from "./demo-store";
import type { Chip, Reply } from "./eva-brain";
import { budgetLabel, type Message } from "./eva-data";
import { useEva } from "./eva-store";
import { newId } from "./ids";
import { loadDemo, reopen, useProjects } from "./project-store";
import { COLOUR_WORDS } from "./prop-variants";
import { activeOf, useRoom } from "./room-store";
import { propsOf, standingOf, useScene } from "./scene-store";
import { mainStage } from "./stage";
import { useStudio } from "./studio-store";

/**
 * The guided demo: the flat as it first opens, and Eva walking a visitor
 * through what the studio does, in twelve scenes. What she says is
 * scripted (whatever is typed, the scene it names plays, else the next),
 * and nothing goes to the server; what happens in the room is the
 * studio's own doing, by the same actions a person takes: her changes
 * applied as one undo step, a piece designed and placed, the plan and a
 * wall's elevation, the room checked, the evening and the lived-in
 * look, the walk, the cart, the photograph. Play the demo plays it
 * through, typing the visitor's side; Pause and Skip hold or move it
 * on. Leaving goes back to the project that was open, as it was: the
 * demo is never saved, and starts fresh each time.
 */
export type DemoScene = {
  id: string;
  /** what it answers to, in the visitor's words */
  keys: RegExp;
  /** the visitor's side, suggested in the box (and typed when it plays
      itself) */
  you: string;
  /** Eva's answer */
  reply: () => Reply;
  /** what happens in the room once she has answered */
  then?: () => void;
  /** what the visitor would do with her answer (Apply, Place): done for
      them when the demo plays itself */
  act?: (msg: Message) => void;
  /** how long it is watched before the next, when it plays itself, ms */
  hold: number;
};

/** a piece of the open room by its id, and where it stands */
const pieceOf = (id: string) =>
  useScene
    .getState()
    .groups.flatMap((g) => g.items)
    .find((n) => n.id === id);
const spotOf = (id: string) => {
  const n = pieceOf(id);
  if (!n) return null;
  const p = propsOf(n, useScene.getState().overrides);
  const at =
    p.x !== undefined && p.y !== undefined
      ? { x: p.x, y: p.y }
      : standingOf(id);
  return at ? { ...at, rotation: p.rotation } : null;
};
/** a piece picked and shown in Detail: the first of Eva's changes
    applied (eva-store's applyChanges tells the demo), or a piece placed */
const show = (ids: readonly string[]) => {
  const id = ids[0];
  if (!id) return;
  useScene.getState().select(id);
  useStudio.getState().setPanelTab("detail");
};
const apply = (msg: Message) => useEva.getState().applyChanges(msg.id, true);
const none = { proposals: [], cards: [], chips: [] } satisfies Omit<
  Reply,
  "text"
>;
const later = (ms: number, f: () => void) =>
  setTimeout(() => useDemo.getState().on && f(), ms);

/** the pieces the demo works with, in the flat's first arrangement */
export const DEMO_PIECES = { sofa: "sofa", sideboard: "sideboard" } as const;
/** the green velvet sofa: the curved velvet model's own size, mm, so
    the real model draws it */
const VELVET_SOFA = { width: 2190, depth: 1020, height: 790 };
/** the piece Eva designs */
const BOOKCASE = "A 1.6 m low bookcase with two doors, oak";

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "hello",
    keys: /\b(hi|hello|hey|we|our|live|read|friends|family|calm|warm)\b/i,
    you: "We're a couple who read a lot and have friends over at weekends. We like warm, calm rooms.",
    reply: () => ({
      ...none,
      text: "Lovely: a living room for reading in and for friends. I'd keep it warm and calm, Japandi in oak and linen with warm neutrals and a little sage, and seats for six on a Saturday. Here's what I heard; keep what fits and I'll plan to it.",
      proposals: [
        { cat: "style", values: ["Japandi", "Minimalist"] },
        { cat: "color", values: ["Warm neutrals", "Sage"] },
        {
          cat: "budget",
          values: [budgetLabel(3000, 6000)],
          budget: [3000, 6000],
        },
      ],
      chips: [
        {
          label: "Brainstorm for me",
          send: "Brainstorm three directions for this room.",
        },
      ],
    }),
    act: (msg) =>
      msg.proposals?.forEach((_, i) =>
        useEva.getState().settleProposal(msg.id, i, true),
      ),
    hold: 3500,
  },
  {
    id: "brainstorm",
    keys: /brainstorm|ideas?|directions?|options?|inspir/i,
    you: "Brainstorm three directions for this room.",
    reply: () => ({
      ...none,
      text: "Three ways this room could go. Warm Japandi: oak, linen, one deep green to anchor it, low and quiet. Reading lounge: a deep sofa, a proper reading chair and lamp by the window, books on show. Easy entertaining: a long sideboard, more seats round the coffee table, warm evening light. They mix well; I'd start with the sofa.",
      chips: [
        {
          label: "Go with warm Japandi",
          send: "Let's go with warm Japandi. Swap the sofa for a deep green velvet one.",
        },
      ],
    }),
    hold: 4000,
  },
  {
    id: "swap",
    keys: /sofa|couch|swap|replace|velvet|green/i,
    you: "Swap the sofa for a deep green velvet three-seater.",
    reply: () => {
      const at = spotOf(DEMO_PIECES.sofa);
      return {
        ...none,
        text: "A deep green velvet sofa, where the old one stands and facing the same way: it anchors the room and the oak warms it. Apply and it's in; one undo takes it back.",
        changes: {
          moves: [],
          removes: [{ id: DEMO_PIECES.sofa, name: "Sofa" }],
          adds: [],
          items: [
            {
              words: "deep green velvet sofa",
              name: "Deep green velvet sofa",
              ...(at ? { x: at.x, y: at.y, rotation: at.rotation } : {}),
              size: VELVET_SOFA,
              colour: COLOUR_WORDS.green!,
            },
          ],
        },
      };
    },
    act: apply,
    hold: 6000,
  },
  {
    id: "finish",
    keys: /walnut|finish|colou?r|darker|sideboard|wood/i,
    you: "Could the sideboard be in walnut, to ground the room?",
    reply: () => ({
      ...none,
      text: "Walnut on the three-bay sideboard: deep enough to ground the green, and the oak around it keeps the room light. It's the same piece, so the price stays as it is.",
      changes: {
        moves: [],
        removes: [],
        adds: [],
        items: [],
        recolours: [
          {
            id: DEMO_PIECES.sideboard,
            name: "Three-bay sideboard",
            colour: "walnut",
            label: "walnut",
          },
        ],
      },
    }),
    act: apply,
    hold: 5000,
  },
  {
    id: "add",
    keys: /\badd\b|reading|corner|nook|chair|table/i,
    you: "Add a reading corner: a comfortable chair and a small table for a cup.",
    reply: () => ({
      ...none,
      text: "A rattan reading chair and a small side table beside it, set where the walkways stay clear. The floor lamp already there lights it.",
      changes: {
        moves: [],
        removes: [],
        adds: [],
        items: [
          { words: "rattan reading chair", name: "Rattan reading chair" },
          { words: "small side table", name: "Small side table" },
        ],
      },
    }),
    act: apply,
    hold: 5000,
  },
  {
    id: "design",
    keys: /design|custom|bookcase|made to measure|build|shel(f|ves)/i,
    you: "Could you design a low oak bookcase, about 1.6 m, with two doors?",
    reply: () => {
      const recipe = recipeFromWords(BOOKCASE);
      const { price, cut } = designOf(recipe);
      return {
        ...none,
        text: `Designed: ${recipe.width} × ${recipe.height} × ${recipe.depth} mm, ${recipe.bays} bays with two doors and a shelf, in 18 mm oak-faced birch ply. Here it is drawn from its own panels, front, side and plan, about ${sgd(price)} and cut from ${cut.sheets.length} sheets. Change anything, then place it.`,
        design: recipe,
      };
    },
    act: () => {
      show([
        useScene
          .getState()
          .addDesign(recipeFromWords(BOOKCASE), useRoom.getState().activeId),
      ]);
    },
    hold: 6000,
  },
  {
    id: "plan",
    keys: /\b2d\b|plan|top|elevation|drawing|from above/i,
    you: "Show me the plan.",
    reply: () => ({
      ...none,
      text: "The plan, with everything as it now stands; then the wall the sofa faces as an elevation, to scale; then back into the room.",
    }),
    then: () => {
      const st = useStudio.getState();
      st.setView("2d");
      later(3500, () => useStudio.getState().setAngle("Front"));
      later(7000, () => useStudio.getState().setView("3d"));
    },
    hold: 9000,
  },
  {
    id: "check",
    keys: /check|comfort|walkway|clear|space|fit|review/i,
    you: "Is everything comfortable to walk around?",
    reply: () => {
      const ctx = useEva.getState().context();
      const first = ctx.findings[0];
      return {
        ...none,
        text: first
          ? `One thing the planner flags: ${first} Laying the room out by the book settles it.`
          : `It all clears: every walkway is at least ${ctx.rules.walkway} mm, the doors swing free and nothing stands in front of a window.`,
        ...(first
          ? {
              changes: {
                moves: [],
                removes: [],
                adds: [],
                items: [],
                layout: "book" as const,
              },
            }
          : {}),
      };
    },
    act: (msg) => {
      if (msg.changes) apply(msg);
    },
    hold: 4000,
  },
  {
    id: "evening",
    keys: /evening|night|dark|lamps?|light|cos[yz]|lived/i,
    you: "What does it feel like in the evening?",
    reply: () => ({
      ...none,
      text: "Evening, with the lamps on and the room lived in: a throw on the sofa, a book left out, the cushions as they fall.",
    }),
    then: () =>
      useStudio.getState().setScene({ light: "evening", livedIn: true }),
    hold: 6000,
  },
  {
    id: "walk",
    keys: /walk|tour|around|through|show me/i,
    you: "Walk me through it.",
    reply: () => ({
      ...none,
      text: "Come in: from the door, past the dining table, to the window and back by the sofa. Click anywhere on the plan and you'll walk there.",
    }),
    then: () => useStudio.getState().startTour(),
    hold: 14000,
  },
  {
    id: "cart",
    keys: /cart|price|cost|budget|total|buy|order/i,
    you: "What would all this cost?",
    reply: () => {
      const sc = useScene.getState();
      const room = activeOf(useRoom.getState()).id;
      const first = useRoom.getState().rooms[0]!.id;
      const pieces = sc.groups
        .flatMap((g) => g.items)
        .filter(
          (n) =>
            n.kind === "piece" &&
            n.price !== undefined &&
            (sc.overrides[n.id]?.roomId ?? first) === room,
        );
      const total = pieces.reduce((t, n) => t + (n.price ?? 0), 0);
      const budget = useEva.getState().preferences.budget?.budget;
      return {
        ...none,
        text: `The Furnishes pieces in this room come to ${sgd(total)}: ${pieces.map((n) => n.name.toLowerCase()).join(", ")}. ${budget ? (total <= budget[1] ? `That's within your ${budgetLabel(budget[0], budget[1])}.` : `That's over your ${budgetLabel(budget[0], budget[1])}; the bookcase is the one to leave for later.`) : ""} They're in the cart; the room items set the scene and aren't for sale.`,
      };
    },
    then: () => {
      const sc = useScene.getState();
      const room = activeOf(useRoom.getState()).id;
      const first = useRoom.getState().rooms[0]!.id;
      for (const n of sc.groups.flatMap((g) => g.items))
        if (
          n.kind === "piece" &&
          (sc.overrides[n.id]?.roomId ?? first) === room &&
          !useScene.getState().cart.includes(n.id)
        )
          useScene.getState().toggleCart(n.id);
      useStudio.getState().setShelfTab("cart");
    },
    hold: 5000,
  },
  {
    id: "photo",
    keys: /photo|picture|render|image|snap/i,
    you: "Can I have a picture of it?",
    reply: () => ({
      ...none,
      text: "Rendering it as a photograph, lit as it is now. Save it, or compare it with the live view, from the Review stage.",
    }),
    then: () => useStudio.getState().setMode("preview"),
    hold: 8000,
  },
];

/** Eva's last word, once every scene has played */
const CLOSING: Chip[] = [
  { label: "Start your own project", act: "demo-new" },
  { label: "Replay the demo", act: "demo-replay" },
  { label: "Leave the demo", act: "demo-leave" },
];

/** the scene words call for: the first not yet played that they name,
    else the next in order; none once all have played */
export const sceneFor = (text: string, played: readonly string[]) => {
  const left = DEMO_SCENES.filter((s) => !played.includes(s.id));
  return left.find((s) => s.keys.test(text)) ?? left[0] ?? null;
};

/** the script's answer to whatever was said: the scene's, its room
    changes after it, the next scene's words in the box */
const turn = (text: string): Reply => {
  const d = useDemo.getState();
  const scene = sceneFor(text, d.played);
  if (!scene)
    return {
      ...none,
      text: "That's the studio: a room planned with you, pieces changed and designed to measure, seen in plan and in 3D, walked through and priced. Start your own project with your own rooms, or play the demo again.",
      chips: CLOSING,
    };
  useDemo.setState({ played: [...d.played, scene.id], scene: scene.id });
  const r = scene.reply();
  const next = sceneFor("", [...d.played, scene.id]);
  // once she has answered: the room, then the next words offered
  later(DEMO_TURN.settle, () => {
    scene.then?.();
    if (next && !useDemo.getState().playing)
      useEva.getState().setDraft(next.you);
  });
  return next ? r : { ...r, chips: [...r.chips, ...CLOSING] };
};

/** the demo's pace when it plays itself, ms: a character typed, the
    wait before Eva's answer is acted on, and the most a scene waits for
    the room to settle */
const DEMO_TURN = { typing: 28, settle: 2400, act: 1400, longest: 30_000 };

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
/** counts each Skip, so a wait under way ends at once */
let skipped = 0;
const wait = async (ms: number) => {
  const at = skipped;
  for (let t = 0; t < ms; t += 100) {
    if (skipped !== at || !useDemo.getState().on) return;
    while (useDemo.getState().paused && useDemo.getState().on) await sleep(200);
    await sleep(100);
  }
};
/** the room drawn and settled, or the longest wait */
const settled = async () => {
  for (let t = 0; t < DEMO_TURN.longest; t += 250) {
    const stage = mainStage();
    if (!stage || stage.dataset.settled === "true") return;
    await sleep(250);
  }
};
const thread = () => {
  const id = useEva.getState().activeId;
  return id ? (useEva.getState().messages[id] ?? []) : [];
};

/** Eva's greeting, as the demo opens */
const greet = () => {
  const eva = useEva.getState();
  const id = eva.newConversation();
  const hello: Message = {
    id: newId("m"),
    who: "eva",
    text: "Hi, I'm Eva. This is a sample HDB flat to try the studio in: tell me how you use your living room and I'll take it from there, or press Play the demo and I'll show you around.",
    at: Date.now(),
    source: "model",
    chips: [{ label: "Play the demo", act: "demo-play" }],
  };
  useEva.setState((s) => ({ messages: { ...s.messages, [id]: [hello] } }));
  eva.setDraft(DEMO_SCENES[0]!.you);
};

/** open the demo: the flat fresh, Eva's greeting, the look as it opens */
export const startDemo = () => {
  const was = useDemo.getState();
  if (!was.on) useProjects.getState().save();
  const look = was.on ? was.look : useStudio.getState().scene;
  useDemo.setState({
    on: true,
    played: [],
    scene: null,
    playing: false,
    paused: false,
    from: was.on ? was.from : useProjects.getState().activeId,
    look,
    turn,
    chip,
    applied: show,
  });
  loadDemo();
  const st = useStudio.getState();
  if (look) st.setScene({ light: "day", livedIn: false });
  st.setMode("edit");
  st.setView("3d");
  st.setEvaTab("agent");
  st.projectSwitched();
  greet();
};

/** leave the demo: the project open before, as it was, and the look */
export const leaveDemo = () => {
  const d = useDemo.getState();
  if (!d.on) return;
  skipped += 1;
  useDemo.setState({
    on: false,
    playing: false,
    paused: false,
    turn: null,
    chip: null,
    applied: null,
    scene: null,
    played: [],
  });
  const st = useStudio.getState();
  st.stopTour();
  st.setWalk(false);
  st.setMode("edit");
  if (d.look) st.setScene(d.look);
  reopen(d.from ?? useProjects.getState().activeId);
  st.projectSwitched();
};

/** play the demo through from where it stands, typing the visitor's side */
export const playDemo = async () => {
  if (useDemo.getState().playing) return;
  useDemo.setState({ playing: true, paused: false });
  const eva = useEva.getState();
  for (;;) {
    const d = useDemo.getState();
    if (!d.on || !d.playing) break;
    const scene = sceneFor("", d.played);
    if (!scene) break;
    // the visitor's words typed into the box, then sent
    for (let i = 1; i <= scene.you.length; i += 3) {
      eva.setDraft(scene.you.slice(0, i));
      await sleep(DEMO_TURN.typing);
    }
    eva.setDraft(scene.you);
    await sleep(DEMO_TURN.typing);
    const before = thread().length;
    eva.submit();
    await sleep(300);
    // the box is not on screen (a narrow layout): said all the same
    if (thread().length === before) void eva.send(scene.you);
    while (useEva.getState().thinking) await sleep(150);
    const said = thread().at(-1);
    await wait(DEMO_TURN.act);
    if (said?.who === "eva" && scene.act) scene.act(said);
    await wait(DEMO_TURN.settle);
    await settled();
    await wait(scene.hold);
    if (scene.id === "walk") useStudio.getState().stopTour();
    if (scene.id === "photo") useStudio.getState().setMode("edit");
  }
  useDemo.setState({ playing: false, paused: false });
};

export const pauseDemo = (paused: boolean) => useDemo.setState({ paused });

/** the next scene now: a wait under way ends, or, by hand, the next
    scene's words are sent */
export const skipDemo = () => {
  skipped += 1;
  const d = useDemo.getState();
  if (d.playing) return;
  const next = sceneFor("", d.played);
  if (next) void useEva.getState().send(next.you);
};

/** what a demo chip does */
function chip(act: DemoAct) {
  if (act === "demo-play") return void playDemo();
  if (act === "demo-replay") return startDemo();
  if (act === "demo-leave") return leaveDemo();
  if (act === "demo-new") {
    leaveDemo();
    useProjects.getState().create();
  }
}
