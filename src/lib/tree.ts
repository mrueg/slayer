import { SLAItem } from '@/lib/sla-calculator';
import { normalizeItem } from '@/lib/normalize';

// Helper to update a deep item in the tree
export const updateItemInTree = (items: SLAItem[], id: string, updates: Partial<SLAItem>): SLAItem[] => {
  return items.map(item => {
    if (item.id === id) {
      return normalizeItem({ ...item, ...updates });
    }
    if (item.children) {
      return { ...item, children: updateItemInTree(item.children, id, updates) };
    }
    return item;
  });
};

// Helper to remove an item from the tree
export const removeItemFromTree = (items: SLAItem[], id: string): SLAItem[] => {
  return items
    .filter(item => item.id !== id)
    .map(item => ({
      ...item,
      children: item.children ? removeItemFromTree(item.children, id) : undefined
    }));
};

// Helper to add a child to a specific group
export const addChildToGroup = (items: SLAItem[], groupId: string, newItem: SLAItem): SLAItem[] => {
  return items.map(item => {
    if (item.id === groupId) {
      return { ...item, children: [...(item.children || []), newItem] };
    }
    if (item.children) {
      return { ...item, children: addChildToGroup(item.children, groupId, newItem) };
    }
    return item;
  });
};

/** Removes a failure domain from every item that references it. */
export const removeDomainReferences = (item: SLAItem, domainId: string): SLAItem => {
  const next = { ...item };
  if (next.domains?.includes(domainId)) {
    const kept = next.domains.filter(d => d !== domainId);
    if (kept.length > 0) next.domains = kept;
    else delete next.domains;
  }
  if (next.children) next.children = next.children.map(child => removeDomainReferences(child, domainId));
  return next;
};
