import { AddressesSection } from "@/features/addresses"
import { EmailSection, PhoneSection, SocialSection } from "@/features/contacts"
import { ProfileHeader } from "@/features/header"
import { InsuranceSection } from "@/features/insurance"
import { PersonalSection } from "@/features/personal"
import { SaveAllBar } from "@/features/save-all"
import { ContactsPanel, InsurancePanel, PageFrame, PortalUrlProvider, ProfileTabs, SAVE_ORDER } from "@/features/shell"
import { requirePageSession } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * Personal Profile (`/`): app bar → header → Contacts / Insurance / Medical
 * tabs (Story 1.8). The composition root (F6-1): each feature's entry point
 * fills its slot; a feature story changes only its own `features/<id>/` files.
 */
export default async function HomePage() {
  const { portalUrl, idle } = await requirePageSession()

  return (
    <PortalUrlProvider portalUrl={portalUrl}>
      <PageFrame
        page="profile"
        header={<ProfileHeader accent />}
        idle={idle}
        saveOrder={SAVE_ORDER}
        saveAllSlot={<SaveAllBar />}
      >
        <ProfileTabs
          accent
          contacts={
            <ContactsPanel
              accent
              sections={{
                personal: <PersonalSection />,
                phone: <PhoneSection />,
                email: <EmailSection />,
                social: <SocialSection />,
                addresses: <AddressesSection />,
              }}
            />
          }
          insurance={<InsurancePanel section={<InsuranceSection />} />}
        />
      </PageFrame>
    </PortalUrlProvider>
  )
}
