/** Addresses (Epic 4) copy; its stories add the strings. */
export const ADDRESS_MESSAGES = {
  addressesEmpty: "No addresses yet", // DRAFT COPY (epics Story 4.1 empty Section)
  // Edit view (Story 4.2).
  addAddress: "Add address", // DRAFT COPY (epics Story 4.2 header, empty row and footer action)
  newAddress: "New address", // DRAFT COPY (key-addresses-edit mock, new row header)
  expandAddress: "Expand {address}", // DRAFT COPY (EXPERIENCE.md Address edit row chevron)
  collapseAddress: "Collapse {address}", // DRAFT COPY (EXPERIENCE.md Address edit row chevron)
  typeLabel: "Address Type", // DRAFT COPY (key-addresses-edit mock field label)
  countryLabel: "Country", // DRAFT COPY (key-addresses-edit mock field label)
  setAsPrimary: "Set as primary", // DRAFT COPY (EXPERIENCE.md Address edit row checkbox)
  line1Label: "Address line 1", // DRAFT COPY (key-addresses-edit mock field label)
  line2Label: "Address line 2", // DRAFT COPY (key-addresses-edit mock field label)
  cityLabel: "City", // DRAFT COPY (key-addresses-edit mock field label)
  countyLabel: "County", // DRAFT COPY (key-addresses-edit mock field label)
  stateLabel: "State/Province", // DRAFT COPY (key-addresses-edit mock field label)
  zipLabel: "Zip", // DRAFT COPY (key-addresses-edit mock field label)
  // The Address Types offered (decision 2a), named as the backend's values.
  typeHome: "Home", // DRAFT COPY (epics Story 4.2 Address Type list)
  typeMainWork: "Main Work", // DRAFT COPY (epics Story 4.2 Address Type list)
  typeOtherWork: "Other Work", // DRAFT COPY (epics Story 4.2 Address Type list)
  typeVacationHome: "Vacation Home", // DRAFT COPY (epics Story 4.2 Address Type list)
  // Validation (Story 4.2, `addressesSchema`).
  chooseType: "Choose an address type", // DRAFT COPY (epics Story 4.2 required Address Type)
  chooseCountry: "Choose a country", // DRAFT COPY (epics Story 4.2 required Country)
  line1Required: "Enter address line 1", // DRAFT COPY (epics Story 4.2 required line 1)
  cityRequired: "Enter a city", // DRAFT COPY (epics Story 4.2 required City)
  zipRequired: "Enter a ZIP code", // DRAFT COPY (epics Story 4.2 required Zip)
  zipFiveDigits: "Enter a 5-digit ZIP code", // verbatim: EXPERIENCE.md Voice and Tone, "Address validation"
  textTooLong: "Up to 255 characters", // DRAFT COPY (spec 4.2 proxy text limit)
  duplicateAddress: "This address is already on your profile", // DRAFT COPY (epics Story 4.2 duplicate)
  primaryFirst: "Set another address as primary first", // DRAFT COPY (backend SET_PRIMARY_LOCATION)
  // Countries (Story 4.2).
  countriesLoadError: "Couldn't load countries", // DRAFT COPY (epics Story 4.2 countries failure)
  countriesNeeded: "Countries need to load before this address can be saved", // DRAFT COPY (spec 4.2 Save blocked without countries)
} as const
