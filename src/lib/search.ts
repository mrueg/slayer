import { SLAItem } from '@/lib/sla-calculator';

export interface TreeSearch {
  query: string;
  /** Items whose name matches */
  matchIds: Set<string>;
  /** Items to render: matches, everything inside a matching group, and the groups leading to a match */
  visibleIds: Set<string>;
  /** Groups that must be open to show a match, whatever their collapse state */
  openIds: Set<string>;
}

/** Filters the tree by name (case-insensitive); null when the query is blank. */
export const searchTree = (root: SLAItem, rawQuery: string): TreeSearch | null => {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return null;

  const matchIds = new Set<string>();
  const visibleIds = new Set<string>([root.id]);
  const openIds = new Set<string>();

  const showAll = (item: SLAItem) => {
    visibleIds.add(item.id);
    item.children?.forEach(showAll);
  };

  // Returns whether the item or anything inside it matches
  const visit = (item: SLAItem): boolean => {
    if (item.name.toLowerCase().includes(query)) {
      matchIds.add(item.id);
      showAll(item);
      return true;
    }
    let containsMatch = false;
    for (const child of item.children || []) {
      if (visit(child)) containsMatch = true;
    }
    if (containsMatch) {
      visibleIds.add(item.id);
      openIds.add(item.id);
    }
    return containsMatch;
  };

  visit(root);
  return { query: rawQuery.trim(), matchIds, visibleIds, openIds };
};
