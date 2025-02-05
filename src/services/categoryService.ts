export interface Category {
  id: string;
  name: string;
  type: 'animal' | 'habitat' | 'region';
  icon?: string;
}

export const defaultCategories: Category[] = [
  { id: 'wildlife', name: 'Wildlife', type: 'animal' },
  { id: 'marine', name: 'Marine Life', type: 'animal' },
  { id: 'birds', name: 'Birds', type: 'animal' },
  { id: 'forest', name: 'Forest', type: 'habitat' },
  { id: 'ocean', name: 'Ocean', type: 'habitat' },
  { id: 'desert', name: 'Desert', type: 'habitat' },
  { id: 'northAmerica', name: 'North America', type: 'region' },
  { id: 'amazon', name: 'Amazon', type: 'region' },
  { id: 'arctic', name: 'Arctic', type: 'region' },
];
