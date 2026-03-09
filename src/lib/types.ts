// 에니어그램 9가지 유형 기반 ValueKey
export type ValueKey =
  | "perfection"  // 1유형: 완벽주의, 원칙
  | "helpfulness" // 2유형: 조력, 배려
  | "achievement" // 3유형: 성취, 성공
  | "uniqueness"  // 4유형: 개성, 독창성
  | "knowledge"   // 5유형: 탐구, 지식
  | "security"    // 6유형: 안전, 충실
  | "enjoyment"   // 7유형: 열정, 즐거움
  | "power"       // 8유형: 도전, 통제력
  | "peace";      // 9유형: 평화, 조화

export type ValuesProfile = {
  weights: Record<ValueKey, number>;
  topValues: ValueKey[];
  summaryKo: string;
};

export type Choice = {
  id: string;
  text: string;
  weights: Partial<Record<ValueKey, number>>;
};

export type Question = {
  id: string;
  title: string;
  prompt: string;
  choices: Choice[];
};

export type SetupAnswer = {
  qid: string;
  choiceId: string;
  choiceText: string;
  weights?: Partial<Record<ValueKey, number>>;
};

export type Protagonist = {
  tone: "warm" | "dry";
  ageBand: "10대" | "20대" | "30대";
  gender: "male" | "female" | "other";
  occupation: "student" | "worker" | "unemployed" | "freelancer";
  subInfo?: string;
  dayJob?: string;
  oneLine?: string;
};

export type GameData = {
  id: string;
  handle: string;
  status: "active" | "finished";
  money: number;
  relationship: number;
  health: number;
  reputation: number;
  happiness: number;
  created_at: string;
};

export type MessageData = {
  id: string;
  game_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};