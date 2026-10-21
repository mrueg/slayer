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

// Ids of the groups containing an item, outermost first ([] for the root, undefined if not found)
export const findAncestorIds = (root: SLAItem, id: string): string[] | undefined => {
  if (root.id === id) return [];
  for (const child of root.children || []) {
    const path = findAncestorIds(child, id);
    if (path) return [root.id, ...path];
  }
  return undefined;
};

// Ids of every group below the root, so "collapse all" still shows the top level
export const findNestedGroupIds = (root: SLAItem): string[] =>
  (root.children || []).flatMap(child =>
    child.type === 'group' ? [child.id, ...findNestedGroupIds(child)] : []
  );
