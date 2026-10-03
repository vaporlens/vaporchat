type Child = Node | string | null | false | undefined;
type Props = Record<string, string | boolean | ((event: Event) => void)>;

/** Tiny element builder: `on*` props become listeners, booleans toggle attributes. */
export function h(tag: string, props: Props = {}, ...children: Child[]) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (typeof value === 'boolean') {
      element.toggleAttribute(key, value);
    } else {
      element.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

export function render(id: string, ...children: Child[]) {
  const container = document.getElementById(id);
  if (!container) throw new Error(`#${id} is missing from the page`);
  container.replaceChildren(
    ...children.filter((child): child is Node | string => !!child),
  );
}
