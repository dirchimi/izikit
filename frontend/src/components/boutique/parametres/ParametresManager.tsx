'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { settingsSections } from '@/lib/boutique/fixtures';
import BoutiqueInfoForm, { type BoutiqueInfoValues } from './BoutiqueInfoForm';
import UsersSection, { type OrgMember } from './UsersSection';

interface BoutiqueCurrent {
  organization: { id: string; slug: string; name: string };
  settings: {
    currency: string;
    phone: string | null;
    city: string | null;
    address: string | null;
    invoiceNote: string | null;
  };
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
interface MeResp {
  user: { id: string; email: string };
}
interface MembersResp {
  members: OrgMember[];
}

export default function ParametresManager() {
  const { toast } = useToast();
  const t = useT();
  const [active, setActive] = useState('boutique');
  const current = settingsSections.find((s) => s.key === active);

  const { data: boutique, refresh: refreshBoutique } = useApi<BoutiqueCurrent>('/api/org/current');
  const { data: me } = useApi<MeResp>('/api/auth/me');
  const { data: membersData, refresh: refreshMembers } = useApi<MembersResp>('/api/org/members');

  const members = membersData?.members ?? [];
  const currentUserId = me?.user.id ?? '';
  const canManage = boutique?.role === 'OWNER' || boutique?.role === 'ADMIN';

  async function saveBoutique(v: BoutiqueInfoValues) {
    await api('/api/org/current', {
      method: 'PATCH',
      body: {
        name: v.name,
        phone: v.phone || null,
        city: v.city || null,
        address: v.address || null,
        invoiceNote: v.note || null,
      },
    });
    toast(t('parametres.savedToast'), 'success');
    await refreshBoutique();
  }

  function renderBoutiquePanel() {
    if (!boutique) {
      return (
        <div className="bg-surface border-border text-muted-foreground font-body rounded-lg border px-6 py-12 text-center text-sm">
          {t('common.loading')}
        </div>
      );
    }
    return (
      <>
        <BoutiqueInfoForm
          initial={{
            name: boutique.organization.name,
            phone: boutique.settings.phone ?? '',
            city: boutique.settings.city ?? '',
            address: boutique.settings.address ?? '',
            note: boutique.settings.invoiceNote ?? '',
          }}
          onSave={saveBoutique}
          onLogo={() => toast(t('parametres.logoSoon'), 'info')}
        />
        <UsersSection
          members={members}
          currentUserId={currentUserId}
          canManage={!!canManage}
          onChanged={refreshMembers}
        />
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t('nav.parametres')}
        subtitle={t('parametres.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col lg:flex-row">
        {/* Sous-navigation des réglages */}
        <div className="border-border flex flex-row overflow-x-auto border-b lg:w-[220px] lg:flex-col lg:overflow-visible lg:border-e lg:border-b-0 lg:py-4">
          {settingsSections.map((s) => {
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`font-body flex items-center gap-3 px-5 py-3 text-sm whitespace-nowrap ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground lg:border-primary font-semibold lg:border-e-2'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon i={s.icon} size={15} />
                {t(`parametres.section.${s.key}`)}
              </button>
            );
          })}
        </div>

        {/* Panneau */}
        <div className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-8">
          {active === 'boutique' && renderBoutiquePanel()}

          {active === 'utilisateurs' && (
            <UsersSection
              members={members}
              currentUserId={currentUserId}
              canManage={!!canManage}
              onChanged={refreshMembers}
            />
          )}

          {active !== 'boutique' && active !== 'utilisateurs' && (
            <div className="bg-surface border-border flex flex-col items-center gap-2 rounded-lg border px-6 py-12 text-center">
              <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
                <Icon i={current?.icon ?? 'settings'} size={20} />
              </div>
              <p className="font-headings text-foreground text-base font-bold">
                {t(`parametres.section.${active}`)}
              </p>
              <p className="text-muted-foreground font-body text-sm">{t('parametres.soon')}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
