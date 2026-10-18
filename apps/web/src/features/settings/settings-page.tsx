import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBreakpoint } from '@/app/shell/use-breakpoint';
import { cn } from '@/lib/cn';
import { PreferencesSection } from './preferences-section';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';

const SECTIONS = [
  { value: 'profile', label: 'Profile' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'security', label: 'Security' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

/** Single 720px column; sub-navigation is vertical on desktop and tabs on mobile (ui-design 6.11). */
export function SettingsPage() {
  const breakpoint = useBreakpoint();
  const vertical = breakpoint !== 'mobile';
  const [section, setSection] = useState<Section>('profile');

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="Settings" />
      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as Section)}
        orientation={vertical ? 'vertical' : 'horizontal'}
        className={cn('flex gap-6', vertical ? 'flex-row' : 'flex-col')}
      >
        <TabsList
          aria-label="Settings sections"
          className={cn(
            vertical ? 'w-44 shrink-0 flex-col border-b-0 border-r' : 'overflow-x-auto',
          )}
        >
          {SECTIONS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                vertical &&
                  'justify-start data-[state=active]:shadow-[inset_-3px_0_0_var(--color-primary)]',
              )}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1">
          <TabsContent value="profile" tabIndex={-1}>
            <ProfileSection />
          </TabsContent>
          <TabsContent value="preferences" tabIndex={-1}>
            <PreferencesSection />
          </TabsContent>
          <TabsContent value="security" tabIndex={-1}>
            <SecuritySection />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
