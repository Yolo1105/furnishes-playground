let seq = 0;

/** an id of its own for a thing made in the browser: the prefix says
    what it is, the time and a count keep it apart from the next */
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${++seq}`;
