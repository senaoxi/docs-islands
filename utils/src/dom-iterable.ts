/**
 * Centralize DOM collection to array conversions here so other modules can
 * keep the default spread preference without depending on DOM.Iterable details.
 */
export const querySelectorAllToArray = <T extends Element = Element>(
  root: ParentNode,
  selector: string,
): T[] => Array.from(root.querySelectorAll<T>(selector));
