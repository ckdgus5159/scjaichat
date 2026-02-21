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
  ageBand: "10대" | "20대" | "30대"; // 40대 제거, 한글로 고정
  gender: "male" | "female" | "other";
  occupation: "highschool" | "student" | "worker";
  subInfo: string;
  dayJob: string;
  oneLine: string;
};