'use client'

import { useState } from 'react'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type ConsultantLevel } from '@/lib/types'
import { AppearanceSection }       from './_components/AppearanceSection'
import { LanguageSection }         from './_components/LanguageSection'
import { BMDSettingsSection }      from './_components/BMDSettingsSection'
import { LegalInfoSection }        from './_components/LegalInfoSection'
import { WorkspaceNameSection }    from './_components/WorkspaceNameSection'
import { MyProfileSection }        from './_components/MyProfileSection'
import { UnassignedUsersSection }  from './_components/UnassignedUsersSection'
import { TeamMembersSection }      from './_components/TeamMembersSection'
import { ConsultantLevelsSection } from './_components/ConsultantLevelsSection'

export default function SettingsPage() {
  const { workspaceId, workspaceName, role, reload } = useWorkspace()
  const { t } = useI18n()
  // Levels are shared between TeamMembersSection and ConsultantLevelsSection
  const [levels, setLevels] = useState<ConsultantLevel[]>([])

  return (
    <div className="mobile-content">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('settingsTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settingsSubtitle')}</p>
      </div>

      <div className="max-w-xl space-y-6">
        <MyProfileSection />
        <AppearanceSection />
        <LanguageSection />

        {role === 'admin' && (
          <>
            <WorkspaceNameSection workspaceId={workspaceId} initialName={workspaceName} onSaved={reload} />
            <LegalInfoSection workspaceId={workspaceId} />
            <BMDSettingsSection />
            <UnassignedUsersSection onAdded={reload} />
            <TeamMembersSection levels={levels} />
            <ConsultantLevelsSection onChanged={setLevels} />
          </>
        )}
      </div>
    </div>
  )
}
