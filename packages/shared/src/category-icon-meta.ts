import type { CategoryIcon } from './categories.js';

/** Picker grouping and search metadata for the category icon allowlist (UI design 13.4, 18.2.4). */
export interface CategoryIconMeta {
  label: string;
  group: string;
  keywords: readonly string[];
}

export const CATEGORY_ICON_GROUPS = [
  'Money and work',
  'Home and bills',
  'Food and drink',
  'Transport',
  'Health and family',
  'Leisure and learning',
  'Shopping and personal',
  'General',
] as const;

export const CATEGORY_ICON_META: Readonly<Record<CategoryIcon, CategoryIconMeta>> = {
  briefcase: {
    label: 'Briefcase',
    group: 'Money and work',
    keywords: ['work', 'job', 'salary', 'office'],
  },
  laptop: {
    label: 'Laptop',
    group: 'Money and work',
    keywords: ['freelance', 'computer', 'remote', 'side project'],
  },
  store: {
    label: 'Store',
    group: 'Money and work',
    keywords: ['shop', 'business', 'sales', 'market'],
  },
  'trending-up': {
    label: 'Trending up',
    group: 'Money and work',
    keywords: ['investment', 'growth', 'stocks', 'returns'],
  },
  percent: {
    label: 'Percent',
    group: 'Money and work',
    keywords: ['interest', 'discount', 'tax', 'rate'],
  },
  'circle-plus': {
    label: 'Plus circle',
    group: 'Money and work',
    keywords: ['extra', 'other income', 'bonus', 'add'],
  },
  'rotate-ccw': {
    label: 'Refund arrow',
    group: 'Money and work',
    keywords: ['refund', 'return', 'reimbursement', 'reversal'],
  },
  wallet: {
    label: 'Wallet',
    group: 'Money and work',
    keywords: ['cash', 'money', 'pocket', 'allowance'],
  },
  banknote: {
    label: 'Banknote',
    group: 'Money and work',
    keywords: ['cash', 'bills', 'money', 'pay'],
  },
  coins: {
    label: 'Coins',
    group: 'Money and work',
    keywords: ['change', 'savings', 'money', 'tips'],
  },
  'piggy-bank': {
    label: 'Piggy bank',
    group: 'Money and work',
    keywords: ['savings', 'save', 'deposit', 'fund'],
  },
  'credit-card': {
    label: 'Credit card',
    group: 'Money and work',
    keywords: ['card', 'debt', 'payment', 'bank'],
  },
  landmark: {
    label: 'Landmark',
    group: 'Money and work',
    keywords: ['bank', 'government', 'fees', 'institution'],
  },
  receipt: {
    label: 'Receipt',
    group: 'Money and work',
    keywords: ['bill', 'invoice', 'receipt', 'expense'],
  },
  'building-2': {
    label: 'Building',
    group: 'Money and work',
    keywords: ['rent income', 'property', 'office', 'company'],
  },
  handshake: {
    label: 'Handshake',
    group: 'Money and work',
    keywords: ['deal', 'client', 'partnership', 'contract'],
  },
  trophy: {
    label: 'Trophy',
    group: 'Money and work',
    keywords: ['prize', 'award', 'win', 'competition'],
  },
  house: {
    label: 'House',
    group: 'Home and bills',
    keywords: ['home', 'rent', 'mortgage', 'housing'],
  },
  zap: {
    label: 'Zap',
    group: 'Home and bills',
    keywords: ['electricity', 'power', 'energy', 'utilities'],
  },
  wifi: {
    label: 'Wifi',
    group: 'Home and bills',
    keywords: ['internet', 'broadband', 'network', 'connection'],
  },
  droplet: {
    label: 'Droplet',
    group: 'Home and bills',
    keywords: ['water', 'utilities', 'plumbing', 'drink'],
  },
  flame: { label: 'Flame', group: 'Home and bills', keywords: ['gas', 'heating', 'fuel', 'fire'] },
  lightbulb: {
    label: 'Lightbulb',
    group: 'Home and bills',
    keywords: ['light', 'ideas', 'electricity', 'bulb'],
  },
  sofa: {
    label: 'Sofa',
    group: 'Home and bills',
    keywords: ['furniture', 'living room', 'home', 'decor'],
  },
  wrench: {
    label: 'Wrench',
    group: 'Home and bills',
    keywords: ['repairs', 'maintenance', 'tools', 'fix'],
  },
  hammer: {
    label: 'Hammer',
    group: 'Home and bills',
    keywords: ['diy', 'tools', 'construction', 'renovation'],
  },
  smartphone: {
    label: 'Smartphone',
    group: 'Home and bills',
    keywords: ['phone', 'mobile', 'cell', 'data plan'],
  },
  tv: {
    label: 'Tv',
    group: 'Home and bills',
    keywords: ['television', 'streaming', 'cable', 'subscription'],
  },
  'shopping-cart': {
    label: 'Shopping cart',
    group: 'Food and drink',
    keywords: ['groceries', 'supermarket', 'store', 'food shopping'],
  },
  utensils: {
    label: 'Utensils',
    group: 'Food and drink',
    keywords: ['restaurant', 'dining', 'meal', 'eating out'],
  },
  coffee: {
    label: 'Coffee',
    group: 'Food and drink',
    keywords: ['cafe', 'tea', 'drinks', 'breakfast'],
  },
  beer: { label: 'Beer', group: 'Food and drink', keywords: ['pub', 'bar', 'drinks', 'alcohol'] },
  wine: {
    label: 'Wine',
    group: 'Food and drink',
    keywords: ['bar', 'drinks', 'alcohol', 'dinner'],
  },
  pizza: {
    label: 'Pizza',
    group: 'Food and drink',
    keywords: ['takeaway', 'fast food', 'delivery', 'dinner'],
  },
  apple: {
    label: 'Apple',
    group: 'Food and drink',
    keywords: ['fruit', 'fresh food', 'healthy', 'produce'],
  },
  bus: {
    label: 'Bus',
    group: 'Transport',
    keywords: ['public transport', 'commute', 'fare', 'transit'],
  },
  fuel: { label: 'Fuel', group: 'Transport', keywords: ['petrol', 'gas', 'diesel', 'fill up'] },
  car: { label: 'Car', group: 'Transport', keywords: ['vehicle', 'auto', 'parking', 'insurance'] },
  bike: {
    label: 'Bike',
    group: 'Transport',
    keywords: ['bicycle', 'cycling', 'commute', 'exercise'],
  },
  'train-front': {
    label: 'Train',
    group: 'Transport',
    keywords: ['rail', 'commute', 'metro', 'subway'],
  },
  plane: {
    label: 'Plane',
    group: 'Transport',
    keywords: ['flight', 'travel', 'airline', 'holiday'],
  },
  luggage: {
    label: 'Luggage',
    group: 'Transport',
    keywords: ['trip', 'vacation', 'baggage', 'travel'],
  },
  'map-pin': {
    label: 'Map pin',
    group: 'Transport',
    keywords: ['location', 'places', 'trip', 'visit'],
  },
  'heart-pulse': {
    label: 'Heart pulse',
    group: 'Health and family',
    keywords: ['health', 'medical', 'doctor', 'wellbeing'],
  },
  shield: {
    label: 'Shield',
    group: 'Health and family',
    keywords: ['insurance', 'protection', 'security', 'cover'],
  },
  stethoscope: {
    label: 'Stethoscope',
    group: 'Health and family',
    keywords: ['doctor', 'clinic', 'checkup', 'medical'],
  },
  pill: {
    label: 'Pill',
    group: 'Health and family',
    keywords: ['pharmacy', 'medicine', 'prescription', 'drugs'],
  },
  dumbbell: {
    label: 'Dumbbell',
    group: 'Health and family',
    keywords: ['gym', 'fitness', 'sport', 'workout'],
  },
  baby: {
    label: 'Baby',
    group: 'Health and family',
    keywords: ['child', 'kids', 'nursery', 'family'],
  },
  'paw-print': {
    label: 'Paw print',
    group: 'Health and family',
    keywords: ['pet', 'dog', 'cat', 'vet'],
  },
  heart: {
    label: 'Heart',
    group: 'Health and family',
    keywords: ['love', 'gifts', 'charity', 'favourite'],
  },
  'hand-heart': {
    label: 'Charity',
    group: 'Health and family',
    keywords: ['donation', 'charity', 'giving', 'volunteer'],
  },
  film: {
    label: 'Film',
    group: 'Leisure and learning',
    keywords: ['movies', 'cinema', 'entertainment', 'video'],
  },
  'graduation-cap': {
    label: 'Graduation cap',
    group: 'Leisure and learning',
    keywords: ['school', 'tuition', 'education', 'course'],
  },
  'book-open': {
    label: 'Book open',
    group: 'Leisure and learning',
    keywords: ['books', 'reading', 'study', 'library'],
  },
  'gamepad-2': {
    label: 'Game controller',
    group: 'Leisure and learning',
    keywords: ['games', 'gaming', 'console', 'hobby'],
  },
  music: {
    label: 'Music',
    group: 'Leisure and learning',
    keywords: ['concert', 'streaming', 'audio', 'instrument'],
  },
  camera: {
    label: 'Camera',
    group: 'Leisure and learning',
    keywords: ['photo', 'photography', 'gear', 'hobby'],
  },
  ticket: {
    label: 'Ticket',
    group: 'Leisure and learning',
    keywords: ['event', 'show', 'tickets', 'admission'],
  },
  umbrella: {
    label: 'Umbrella',
    group: 'Leisure and learning',
    keywords: ['rain', 'outdoor', 'weather', 'cover'],
  },
  leaf: {
    label: 'Leaf',
    group: 'Leisure and learning',
    keywords: ['garden', 'nature', 'plants', 'eco'],
  },
  'shopping-bag': {
    label: 'Shopping bag',
    group: 'Shopping and personal',
    keywords: ['clothes', 'retail', 'purchase', 'mall'],
  },
  sparkles: {
    label: 'Sparkles',
    group: 'Shopping and personal',
    keywords: ['beauty', 'cleaning', 'treat', 'luxury'],
  },
  gift: {
    label: 'Gift',
    group: 'Shopping and personal',
    keywords: ['present', 'birthday', 'holiday', 'celebration'],
  },
  shirt: {
    label: 'Shirt',
    group: 'Shopping and personal',
    keywords: ['clothing', 'apparel', 'laundry', 'fashion'],
  },
  scissors: {
    label: 'Scissors',
    group: 'Shopping and personal',
    keywords: ['haircut', 'barber', 'salon', 'grooming'],
  },
  repeat: {
    label: 'Repeat',
    group: 'Shopping and personal',
    keywords: ['subscription', 'recurring', 'monthly', 'membership'],
  },
  'circle-ellipsis': {
    label: 'More',
    group: 'General',
    keywords: ['other', 'misc', 'miscellaneous', 'various'],
  },
  calendar: {
    label: 'Calendar',
    group: 'General',
    keywords: ['annual', 'schedule', 'date', 'yearly'],
  },
  tag: {
    label: 'Tag',
    group: 'General',
    keywords: ['label', 'general', 'default', 'uncategorized'],
  },
};
