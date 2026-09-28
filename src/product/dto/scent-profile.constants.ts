export const SCENT_OCCASION_VALUES = [
  "everyday",
  "office",
  "date-night",
  "special",
] as const;

export const SCENT_MOOD_VALUES = [
  "fresh",
  "warm",
  "dark",
  "soft",
] as const;

export const SCENT_PERSONALITY_VALUES = [
  "confident",
  "inviting",
  "mysterious",
  "romantic",
] as const;

export type ScentOccasionInput =
  (typeof SCENT_OCCASION_VALUES)[number];

export type ScentMoodInput =
  (typeof SCENT_MOOD_VALUES)[number];

export type ScentPersonalityInput =
  (typeof SCENT_PERSONALITY_VALUES)[number];
