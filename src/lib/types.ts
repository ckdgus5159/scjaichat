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
  ageBand: "teen" | "20s" | "30s" | "40s"; // 'teen' 추가
  gender: "male" | "female" | "other";    // 성별 추가
  occupation: "highschool" | "student" | "worker"; // 신분 추가
  subInfo: string; // 학과, 학교명, 직종 등 상세정보
  dayJob: string;
  oneLine: string;
};