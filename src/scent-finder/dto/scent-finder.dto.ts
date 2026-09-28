import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

const OCCASIONS = [
  "everyday",
  "office",
  "date-night",
  "special",
] as const;

const MOODS = [
  "fresh",
  "warm",
  "dark",
  "soft",
] as const;

const PERSONALITIES = [
  "confident",
  "inviting",
  "mysterious",
  "romantic",
] as const;

const BUDGETS = [
  "under-1300",
  "1300-1700",
  "1700-plus",
  "any",
] as const;

export type ScentOccasion =
  (typeof OCCASIONS)[number];

export type ScentMood =
  (typeof MOODS)[number];

export type ScentPersonality =
  (typeof PERSONALITIES)[number];

export type ScentBudget =
  (typeof BUDGETS)[number];

export class ScentFinderDto {
  @IsOptional()
  @IsIn(OCCASIONS)
  occasion?: ScentOccasion;

  @IsOptional()
  @IsIn(MOODS)
  mood?: ScentMood;

  @IsOptional()
  @IsIn(PERSONALITIES)
  personality?: ScentPersonality;

  @IsOptional()
  @IsIn(BUDGETS)
  budget?: ScentBudget;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 3;
}
