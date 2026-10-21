/** Provider registration (Epic 9) copy; its stories add the strings. */
export const NPI_MESSAGES = {
  heading: "Healthcare credentials", // DRAFT COPY
  about: "About provider registration", // DRAFT COPY
  information: "Registering links your 1health account to your NPI from the national provider registry. Adding your practice's NPI is optional. Once registered, it can't be changed here.", // DRAFT COPY
  instructions: "Please find your provider and NPI information to continue…", // DRAFT COPY
  personalSearch: "Search for your personal NPI number", // DRAFT COPY
  practiceSearch: "Search for your practice's (hospital, clinic, lab, etc.) NPI Number", // DRAFT COPY
  register: "Register", // DRAFT COPY
  npi: "NPI", // DRAFT COPY
  personalNpiTaken: "This personal NPI is already registered. Check that you selected your own.",
  practiceNpiTaken: "This practice NPI is already registered. Check that you selected the right practice.",
  practiceSupportLoadError: "Couldn't load the support contact.", // DRAFT COPY (epics Story 9.3 Practice-name popover error; moved from F5-1)
} as const
