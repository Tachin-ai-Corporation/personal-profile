/** The shell's public API. Import from `@/features/shell`. */

export { PortalUrlProvider, usePortalUrl, type PortalUrlProviderProps } from "./portal-url-provider"
export { SwrProvider } from "./swr-provider"
export { useMyself, type UseMyselfResult } from "./use-myself"
export { AuthScreen, SUCCESS_REDIRECT_DELAY_MS, type AuthScreenProps } from "./auth-screen"
export { AUTH_RETRY_DELAY_MS, MAX_AUTH_ATTEMPTS, normalizeLpl, runLaunchFlow, type LaunchFlowResult } from "./launch-flow"
export {
  LoadError,
  NoAccess,
  ReadStateFor,
  type LoadErrorProps,
  type NoAccessProps,
  type ReadStateForProps,
} from "./read-state"

// Navigation (AD-26) and Sections (AD-7).
export {
  ACCOUNT_TABS,
  DEFAULT_ACCOUNT_TAB,
  DEFAULT_PROFILE_TAB,
  PAGE_PATHS,
  PROFILE_TABS,
  CANCELLED_CODE,
  SESSION_EXPIRED_CODE,
  PAGE_TAB_PARAM,
  TAB_PARAM,
  isCancelled,
  pageTabTarget,
  isAccountTab,
  isProfileTab,
  isSessionExpired,
  sectionHeadingId,
  type AccountSavePart,
  type AccountTab,
  type DraftDiffRow,
  type DraftValues,
  type NavTarget,
  type PageId,
  type ProfileTab,
  type SaveError,
  type SaveErrorCode,
  type SaveResult,
  type SectionDataStatus,
  type SectionEvent,
  type SectionId,
  type SectionRegistration,
  type ValidateResult,
} from "./nav-types"
export { CurrentPageProvider, LOGOUT_TIMEOUT_MS, navigate, useCurrentPage, useNavigate, type NavigateDeps } from "./navigate"
export { requestLeave, setLeaveGuard, type LeaveGuard as LeaveGuardFn } from "./leave"
export { onBeforeExit, onBeforeSessionExpired, type ExitCallback } from "./exit-hooks"
export {
  SectionRegistryProvider,
  useDirtyCount,
  useIsAnyDirty,
  useRegisterSection,
  useSectionRegistry,
  type RegisteredSection,
  type SectionRegistry,
} from "./section-registry"
export { LeaveGuard, type LeaveGuardProps } from "./leave-guard"

// Drafts (Story 1.15; F4). Sections never touch storage: they register `draftFields` and render `SectionContainer sectionId`.
// The draft store itself is deliberately not exported: only drafts.ts reads, writes and deletes keys.
export { DRAFT_DEBOUNCE_MS, DRAFT_DENYLIST, DRAFT_MAX_AGE_MS, defaultDraftDiff, type DraftOffer } from "./drafts"
export { DraftsProvider, useSectionDraft, type DraftsProviderProps, type SectionDraft } from "./draft-provider"
export { SectionDraftNotice, type SectionDraftNoticeProps } from "./draft-banner"
export { DraftCompare, type DraftCompareProps } from "./draft-compare"

// The Section edit kit (Stories 1.11–1.14; F3-2).
export {
  useSectionForm,
  type SectionFooterBindings,
  type SectionForm,
  type SectionMode,
  type StartEditOptions,
  type UseSectionFormOptions,
} from "./use-section-form"
export { SectionHeader, type SectionHeaderProps } from "./section-header"
export { SectionContainer, type SectionContainerProps } from "./section-container"
export { SectionFooter, type SectionFooterAddRow, type SectionFooterError, type SectionFooterProps } from "./section-footer"
export {
  KeyValueEditTable,
  KeyValueTable,
  type KeyValueEditRow,
  type KeyValueEditTableProps,
  type KeyValueRow,
  type KeyValueTableProps,
} from "./key-value-table"
export { runSaveSteps, type RunSaveStepsOptions, type SaveStep, type SaveStepsError, type SaveStepsResult } from "./run-save-steps"
export {
  runSaveAll,
  saveAllSummary,
  type InvalidSection,
  type SaveAllOptions,
  type SaveAllOutcome,
  type SaveAllSummary,
  type SectionRef,
} from "./save-all"
export { SessionDialog } from "./session-dialog"
export { IdleWarning, IDLE_PING_TIMEOUT_MS, IDLE_SAFETY_MARGIN_MS, IDLE_WARNING_LEAD_MS, type IdleWarningProps } from "./idle-warning"
export { AppBar } from "./app-bar"
export { PageNav } from "./page-nav"
export { ReturnLink } from "./return-link"

// Page composition (F6-1): generic tabs, page presets, slots and placeholders. Composition happens only in app/**.
export { assertPageTabsConfig, PageTabs, type PageTabsProps } from "./page-tabs"
export { ACCOUNT_TAB_DEFINITIONS, PAGE_TAB_LIST_LABELS, PROFILE_TAB_DEFINITIONS, type PageTabDefinition } from "./page-tabs-config"
export { MyselfErrorClaimProvider, useClaimMyselfError, useMyselfErrorClaimed } from "./myself-error-claim"
export { ProfileTabs, QuietPanel, type ProfileTabsProps } from "./profile-tabs"
export { AccountTabs, type AccountTabsProps } from "./account-tabs"
export { AccountPersonalPanel, AnchoredPanel, type AccountPersonalPanelProps, type AnchoredPanelProps } from "./anchored-panel"
export {
  AccountSectionPlaceholder,
  AccountTabPlaceholder,
  ProfileSectionPlaceholder,
  type AccountPlaceholderId,
  type AccountSectionPlaceholderProps,
  type AccountTabPlaceholderId,
  type AccountTabPlaceholderProps,
  type ProfilePlaceholderId,
  type ProfileSectionPlaceholderProps,
} from "./placeholders"
export {
  SectionFrameProvider,
  useLandmarkCheck,
  useSectionFrame,
  type SectionFrame,
  type SectionFrameId,
  type SectionFrameProviderProps,
} from "./section-frame"
export { SAVE_ORDER } from "./save-order"
export { handoffHref, isHandoffHref, isTenantId, TENANT_ID_PATTERN, type HandoffTarget } from "./handoff"

// Read states and Section navigation (F3-3).
export {
  FrameSkeleton,
  ORG_GRID_CLASSES,
  StateFrame,
  loadErrorMessage,
  type FrameLevel,
  type FrameSkeletonProps,
  type FrameState,
  type LoadErrorCopy,
  type BarWidth,
  type SkeletonVariant,
  type StateFrameProps,
} from "./state-frame"
export { SignatureThumb, type SignatureThumbProps } from "./signature-thumb"
export {
  ACCOUNT_ANCHORS,
  PROFILE_SECTION_IDS,
  PROFILE_SECTIONS,
  PROFILE_SUB_ANCHORS,
  SECTION_COLUMNS,
  SIGNATURE_ANCHOR,
  isProfileSectionId,
  type AccountAnchor,
  type AccountSectionId,
  type ProfileSectionId,
} from "./anchors"
export { SectionLandmark, type SectionLandmarkProps } from "./section-landmark"
export { SectionNav, useSectionNavigation, type SectionNavProps, type SectionNavState } from "./section-nav"
export { motionAwareScrollBehavior, useHashAnchors, type HashAnchors, type HashAnchorsOptions } from "./use-hash-anchors"
export { SectionCountProvider, useReportSectionCount, useSectionCounts, type SectionCounts } from "./section-counts"
export { ContactsPanel, type ContactsPanelProps } from "./contacts-panel"
export { InsurancePanel, type InsurancePanelProps } from "./insurance-panel"
export { PageFrame, type PageFrameProps } from "./page-frame"
export { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"

// Section row kit and countdown (F6-2).
export { RowActions, type RowAction, type RowActionsProps } from "./row-actions"
export { ROW_EDIT_STATE_CLASSES, RowEditStatus, RowRemoval, type RowEditState, type RowRemovalProps } from "./row-removal"
export { SectionTable, type MobileLine, type SectionTableColumn, type SectionTableLayout, type SectionTableProps } from "./section-table"
export { useCountdown, type Countdown, type UseCountdownOptions } from "./use-countdown"
export {
  PARTIAL_TOAST_MS,
  SUCCESS_TOAST_MS,
  toastError,
  toastPartial,
  toastSuccess,
  type ShownToast,
  type ToastErrorOptions,
} from "./toasts"
