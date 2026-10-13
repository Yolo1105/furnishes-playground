/** a whole number from a name, the same every time: a piece's, a
    room's or a print's own variation is read from its id with it */
export const seedOf = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
};
