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
  SESSION_EXPIRED_CODE,
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

// The Section edit kit (Stories 1.11–1.14; F3-2).
export {
  useSectionForm,
  type SectionFooterBindings,
  type SectionForm,
  type SectionMode,
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
export { PageTabs, ProfileTabs, type PageTabDefinition, type PageTabsProps } from "./page-tabs"
export { PageFrame, type PageFrameProps } from "./page-frame"
export { DESKTOP_QUERY, useMediaQuery } from "./use-media-query"
export {
  PARTIAL_TOAST_MS,
  SUCCESS_TOAST_MS,
  toastError,
  toastPartial,
  toastSuccess,
  type ShownToast,
  type ToastErrorOptions,
} from "./toasts"
