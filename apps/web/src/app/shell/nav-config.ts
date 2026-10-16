import {
  ArrowLeftRight,
  ChartColumn,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavTo =
  | '/dashboard'
  | '/transactions'
  | '/wallets'
  | '/budgets'
  | '/recurring'
  | '/reports'
  | '/categories'
  | '/settings'
  | '/admin'
  | '/admin/users'
  | '/admin/categories'
  | '/admin/audit';

export interface NavItem {
  label: string;
  to: NavTo;
  icon: LucideIcon;
  /** Admin overview must only match exactly, otherwise it is active on every admin page. */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/** Primary navigation groups (ui-design 4.3). Settings lives in the user menu, not the rail. */
export const PRIMARY_NAV: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Money',
    items: [
      { label: 'Transactions', to: '/transactions', icon: ArrowLeftRight },
      { label: 'Wallets', to: '/wallets', icon: Wallet },
      { label: 'Budgets', to: '/budgets', icon: PiggyBank },
      { label: 'Recurring', to: '/recurring', icon: Repeat },
    ],
  },
  { label: 'Insight', items: [{ label: 'Reports', to: '/reports', icon: ChartColumn }] },
  { label: 'Setup', items: [{ label: 'Categories', to: '/categories', icon: Tags }] },
];

export const ADMIN_NAV: NavGroup = {
  label: 'Administration',
  items: [
    { label: 'Overview', to: '/admin', icon: ShieldCheck, exact: true },
    { label: 'Users', to: '/admin/users', icon: Users },
    { label: 'Default categories', to: '/admin/categories', icon: Tags },
    { label: 'Audit log', to: '/admin/audit', icon: ScrollText },
  ],
};

export const SETTINGS_ITEM: NavItem = { label: 'Settings', to: '/settings', icon: Settings };

/** Mobile bottom bar (ui-design 6.1): Home, Activity, Add (center), Budgets, More. */
export const BOTTOM_BAR_ITEMS: readonly NavItem[] = [
  { label: 'Home', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Activity', to: '/transactions', icon: ArrowLeftRight },
  { label: 'Budgets', to: '/budgets', icon: PiggyBank },
];

/** Everything the bottom bar does not show lives in the More sheet. */
export const MORE_ITEMS: readonly NavItem[] = [
  { label: 'Wallets', to: '/wallets', icon: Wallet },
  { label: 'Recurring', to: '/recurring', icon: Repeat },
  { label: 'Reports', to: '/reports', icon: ChartColumn },
  { label: 'Categories', to: '/categories', icon: Tags },
  SETTINGS_ITEM,
];
