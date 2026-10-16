/** The profile header (Stories 1.9, 1.10). */
export const HEADER_MESSAGES = {
  loading: "Loading your profile", // DRAFT COPY (skeleton accessible name)
  primaryPhone: "Primary phone", // DRAFT COPY (header meta label)
  primaryEmail: "Primary email", // DRAFT COPY (header meta label)
  // Change profile picture (Story 1.10): the avatar button's name and the dialog title.
  changePicture: "Change profile picture", // verbatim: EXPERIENCE.md Voice and Tone, "Change profile picture"
  chooseAnotherFile: "Choose another file", // verbatim: EXPERIENCE.md Voice and Tone, "Change profile picture"
  pictureRules: "JPG, PNG or BMP, up to 6 MB.", // verbatim: EXPERIENCE.md Voice and Tone, "Change profile picture"
  pictureTooLarge: "{fileName} is {size}. Choose a file up to 6 MB.", // verbatim: EXPERIENCE.md Voice and Tone, "Picture too large"
  currentPicture: "Current picture", // verbatim: EXPERIENCE.md Voice and Tone, "Picture too large"
  notChanged: "Not changed", // verbatim: EXPERIENCE.md Voice and Tone, "Picture too large"
  pictureWrongType: "{fileName} isn't a JPG, PNG or BMP. Choose another file.", // DRAFT COPY (epics Story 1.10, flagged for PM review)
  pictureFileMeta: "{type} · {size}", // DRAFT COPY (epics Story 1.10, e.g. "JPG · 2.4 MB")
  fileSizeMb: "{size} MB", // DRAFT COPY (file size, one decimal)
  fileSizeKb: "{size} KB", // DRAFT COPY (file size under 1 MB)
  newPicturePreview: "Preview of your new profile picture", // DRAFT COPY (mockup key-profile-picture.html preview name)
  pictureSaved: "Profile picture saved.", // DRAFT COPY (epics Story 1.10 success toast)
  pictureSaveFailed: "Couldn't save your profile picture. Check your connection.", // DRAFT COPY (epics Story 1.10 network / 5xx line)
} as const
