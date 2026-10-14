/**
 * What stands in the walker's way, room by room: each room's pieces on
 * the floor as boxes on the sheet (mm), noted by the room as it draws
 * them (a rug is walked over, so it is not one). The walk reads them all
 * when it works out a way, so it goes round the pieces in every room it
 * passes through, not only the one being worked on.
 */
export type SheetBox = { x0: number; y0: number; x1: number; y1: number };

const byRoom = new Map<string, SheetBox[]>();

export const noteBlocks = (room: string, boxes: SheetBox[]) => {
  byRoom.set(room, boxes);
};
export const forgetBlocks = (room: string) => {
  byRoom.delete(room);
};
/** every room's pieces, sheet mm */
export const allBlocks = (): SheetBox[] => [...byRoom.values()].flat();
