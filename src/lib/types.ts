export type ValueKey =
  | "stability"
  | "growth"
  | "connection"
  | "freedom"
  | "recognition"
  | "meaning"
  | "comfort"
  | "integrity";

export type SetupAnswer = {
  qid: string;
  choiceId: string;
  choiceText: string;
  weights: Partial<Record<ValueKey, number>>;
};

export type ValuesProfile = {
  weights: Record<ValueKey, number>; // normalized-ish
  topValues: ValueKey[];
  summaryKo: string;
};

export type Protagonist = {
  tone: "warm" | "dry" | "poetic";
  ageBand: "20s" | "30s" | "40s";
  dayJob: string;
  oneLine: string;
};
