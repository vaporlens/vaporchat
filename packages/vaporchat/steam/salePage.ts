import type { RichBlock, SaleSection, StoreItem } from '../protocol.ts';
import { getEvents } from './events.ts';
import { parseRichText } from './richText.ts';
import {
  type ApiStoreItem,
  fetchStoreItems,
  type StoreRef,
  toStoreItem,
} from './store.ts';

/** A section of a sale page as its event's JSON describes it, only what we use. */
interface ApiSaleSection {
  section_type?: string;
  /** per language, english first, entries can be null */
  localized_label?: (string | null)[];
  /** a localization token like `#Sale_default_label`, or the label itself */
  default_label?: string;
  capsules?: { id: number; type?: string }[];
  text_section_contents?: string[];
}

/** A sale section before its items are looked up. */
interface SaleSectionRefs {
  title: string;
  body: RichBlock[];
  refs: StoreRef[];
}

function ref({ id, type }: { id: number; type?: string }): StoreRef {
  if (type === 'bundle') return { bundleid: id };
  if (type === 'sub') return { packageid: id };
  // games, demos, dlc, software, soundtracks are apps
  return { appid: id };
}

/** One key per store item, for refs and for the items GetItems answers with. */
function refKey(ref: StoreRef) {
  if ('bundleid' in ref) return `2:${ref.bundleid}`;
  if ('packageid' in ref) return `1:${ref.packageid}`;
  return `0:${ref.appid}`;
}

function itemKey({ item_type = 0, id }: ApiStoreItem) {
  return `${item_type}:${id}`;
}

function title({ localized_label, default_label = '' }: ApiSaleSection) {
  return (
    localized_label?.[0] ?? (default_label.startsWith('#') ? '' : default_label)
  );
}

/**
 * The text and game list sections of a sale page, in order. Other sections (tabs, trailers,
 * streams, links) only make sense on the website.
 */
export function toSaleSections(jsondata: string): SaleSectionRefs[] {
  let sections: ApiSaleSection[];
  try {
    sections =
      (JSON.parse(jsondata) as { sale_sections?: ApiSaleSection[] })
        .sale_sections ?? [];
  } catch {
    return [];
  }
  return sections.flatMap((section): SaleSectionRefs[] => {
    if (section.section_type === 'text_section') {
      const body = parseRichText(
        (section.text_section_contents ?? []).join('\n'),
      );
      return body.length > 0 ? [{ title: title(section), body, refs: [] }] : [];
    }
    if (section.section_type === 'items' && section.capsules?.length) {
      return [
        { title: title(section), body: [], refs: section.capsules.map(ref) },
      ];
    }
    return [];
  });
}

/** A sale event's page: its texts and the games of each section. */
export async function getSalePage(
  eventId: string,
  country: string,
): Promise<SaleSection[]> {
  const [event] = await getEvents([eventId]);
  if (!event) throw new Error('Steam has no such event');
  const sections = toSaleSections(event.jsondata ?? '');
  // a game can be in several sections, each is looked up once
  const refs = new Map(
    sections.flatMap((section) => section.refs.map((r) => [refKey(r), r])),
  );
  const items = new Map<string, StoreItem>(
    (await fetchStoreItems([...refs.values()], country)).map((item) => [
      itemKey(item),
      toStoreItem(item),
    ]),
  );
  return sections
    .map(({ title, body, refs }) => ({
      title,
      body,
      items: refs.flatMap((r) => items.get(refKey(r)) ?? []),
    }))
    .filter((section) => section.body.length > 0 || section.items.length > 0);
}
