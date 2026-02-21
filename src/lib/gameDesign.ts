import { SetupAnswer, ValueKey, ValuesProfile, Protagonist } from "./types";

export type SetupQuestion = {
  id: string;
  title: string;
  prompt: string;
  choices: Array<{
    id: string;
    text: string;
    weights: Partial<Record<ValueKey, number>>;
  }>;
};

export const VALUE_KEYS: ValueKey[] = [
  "stability",
  "growth",
  "connection",
  "freedom",
  "recognition",
  "meaning",
  "comfort",
  "integrity",
];

export const QUESTIONS: SetupQuestion[] = [
  {
    id: "q1",
    title: "하루가 끝났을 때",
    prompt: "오늘이 ‘좋은 하루’였다고 느끼는 기준에 가장 가까운 건?",
    choices: [
      { id: "a", text: "큰 문제 없이 무난하게 흘러갔다", weights: { stability: 3, comfort: 1 } },
      { id: "b", text: "내가 조금이라도 성장했다", weights: { growth: 3, meaning: 1 } },
      { id: "c", text: "누군가와 진짜로 연결된 순간이 있었다", weights: { connection: 3 } },
      { id: "d", text: "내가 원한 대로 선택하고 움직였다", weights: { freedom: 3 } },
    ],
  },
  {
    id: "q2",
    title: "갈등이 생겼을 때",
    prompt: "누군가와 의견이 충돌하면 보통 어떤 쪽을 택해?",
    choices: [
      { id: "a", text: "원칙과 기준을 지키는 게 중요하다", weights: { integrity: 3, stability: 1 } },
      { id: "b", text: "관계가 깨지지 않게 조율한다", weights: { connection: 3 } },
      { id: "c", text: "내 선택권이 침해되면 선을 긋는다", weights: { freedom: 3 } },
      { id: "d", text: "배우는 기회로 삼아 더 나은 방식을 찾는다", weights: { growth: 2, meaning: 1 } },
    ],
  },
  {
    id: "q3",
    title: "돈의 의미",
    prompt: "돈이 생기면 가장 먼저 떠오르는 사용 방식은?",
    choices: [
      { id: "a", text: "불안을 줄이는 저축/안전망", weights: { stability: 3 } },
      { id: "b", text: "경험/배움에 투자", weights: { growth: 2, meaning: 1 } },
      { id: "c", text: "사람들과의 시간/선물/모임", weights: { connection: 2, recognition: 1 } },
      { id: "d", text: "내 삶의 선택지를 넓히는 데", weights: { freedom: 3 } },
    ],
  },
  {
    id: "q4",
    title: "칭찬을 들을 때",
    prompt: "어떤 칭찬이 가장 오래 남아?",
    choices: [
      { id: "a", text: "“믿음직해.”", weights: { stability: 2, integrity: 1 } },
      { id: "b", text: "“너랑 있으면 편해.”", weights: { comfort: 2, connection: 1 } },
      { id: "c", text: "“대단하다/멋지다.”", weights: { recognition: 3 } },
      { id: "d", text: "“너답다.”", weights: { freedom: 2, integrity: 1 } },
    ],
  },
  {
    id: "q5",
    title: "일상 루틴",
    prompt: "루틴이 무너졌을 때 더 힘든 건?",
    choices: [
      { id: "a", text: "예측 가능성이 사라지는 것", weights: { stability: 3 } },
      { id: "b", text: "내가 쌓아오던 성장이 끊기는 것", weights: { growth: 3 } },
      { id: "c", text: "사람들과의 약속/리듬이 깨지는 것", weights: { connection: 2, integrity: 1 } },
      { id: "d", text: "내 시간이 내 것이 아니게 되는 것", weights: { freedom: 3 } },
    ],
  },
  {
    id: "q6",
    title: "위로가 필요할 때",
    prompt: "힘든 날, 무엇이 회복에 가장 도움이 돼?",
    choices: [
      { id: "a", text: "조용히 쉬면서 컨디션을 회복", weights: { comfort: 3 } },
      { id: "b", text: "누군가와 솔직한 대화", weights: { connection: 3 } },
      { id: "c", text: "내가 의미 있다고 느끼는 일 한 조각", weights: { meaning: 3 } },
      { id: "d", text: "혼자 결정하고 움직이는 작은 자유", weights: { freedom: 3 } },
    ],
  },
  {
    id: "q7",
    title: "후회 포인트",
    prompt: "10년 뒤, 어떤 후회가 더 무서울까?",
    choices: [
      { id: "a", text: "안정적으로 지키지 못했다", weights: { stability: 3 } },
      { id: "b", text: "가능성/성장을 놓쳤다", weights: { growth: 3 } },
      { id: "c", text: "사람을 놓쳤다", weights: { connection: 3 } },
      { id: "d", text: "내 삶을 내가 선택하지 못했다", weights: { freedom: 3 } },
    ],
  },
  {
    id: "q8",
    title: "정의감",
    prompt: "불공정한 상황을 보면?",
    choices: [
      { id: "a", text: "원칙을 세우고 바로잡고 싶다", weights: { integrity: 3, meaning: 1 } },
      { id: "b", text: "피해자가 덜 아프게 돕고 싶다", weights: { connection: 2, meaning: 1 } },
      { id: "c", text: "구조를 바꾸는 방법을 배우고 싶다", weights: { growth: 2, meaning: 1 } },
      { id: "d", text: "그 상황에서 벗어나 내 삶을 지킨다", weights: { freedom: 2, stability: 1 } },
    ],
  },
  {
    id: "q9",
    title: "자기 이미지",
    prompt: "사람들이 나를 어떤 사람으로 기억하면 좋겠어?",
    choices: [
      { id: "a", text: "성실하고 믿을 수 있는 사람", weights: { integrity: 2, stability: 1 } },
      { id: "b", text: "따뜻하고 함께하기 좋은 사람", weights: { connection: 2, comfort: 1 } },
      { id: "c", text: "자기 길을 개척한 사람", weights: { freedom: 2, growth: 1 } },
      { id: "d", text: "뭔가를 이뤄낸/인정받은 사람", weights: { recognition: 3 } },
    ],
  },
  {
    id: "q10",
    title: "삶의 문장",
    prompt: "다음 중 ‘내 삶이 이랬으면’에 가장 가까운 문장은?",
    choices: [
      { id: "a", text: "크게 흔들리지 않고 단단했으면", weights: { stability: 3 } },
      { id: "b", text: "어제보다 나은 내가 되었으면", weights: { growth: 3 } },
      { id: "c", text: "좋은 사람들과 서로를 남겼으면", weights: { connection: 3 } },
      { id: "d", text: "나답게 선택하며 살았으면", weights: { freedom: 3, integrity: 1 } },
    ],
  },
];

export function buildValuesProfile(answers: SetupAnswer[]): ValuesProfile {
  const weights: Record<ValueKey, number> = {
    stability: 0,
    growth: 0,
    connection: 0,
    freedom: 0,
    recognition: 0,
    meaning: 0,
    comfort: 0,
    integrity: 0,
  };

  for (const a of answers) {
    for (const [k, v] of Object.entries(a.weights)) {
      weights[k as ValueKey] += v ?? 0;
    }
  }

  const sorted = [...VALUE_KEYS].sort((a, b) => weights[b] - weights[a]);
  const topValues = sorted.slice(0, 3);

  const labelKo: Record<ValueKey, string> = {
    stability: "안정",
    growth: "성장",
    connection: "관계",
    freedom: "자유",
    recognition: "인정",
    meaning: "의미",
    comfort: "휴식",
    integrity: "원칙",
  };

  const summaryKo =
    `당신이 생각하는 행복은 주로 ` +
    `${topValues.map(v => labelKo[v]).join(", ")} ` +
    `쪽에서 자주 올라옵니다. (꿈/목표와 무관하게, 이 가치가 충족되면 행복이 오를 수 있어요.)`;

  return { weights, topValues, summaryKo };
}

export function buildProtagonist(answers: SetupAnswer[]): Protagonist {
  // 간단한 로직으로 tone과 ageBand 결정 (기존 로직 유지)
  const tone = answers.length % 2 === 0 ? "warm" : "dry";
  const ageBand = "20s"; // 기본값
  const dayJobPool = ["사무직", "전문직", "프리랜서", "서비스직"];
  const idx = answers.reduce((acc, a) => acc + a.choiceId.charCodeAt(0), 0) % dayJobPool.length;

  // ✅ 오류 해결: Protagonist 타입에 추가된 gender, occupation, subInfo 기본값을 넣어줍니다.
  return {
    tone,
    ageBand,
    gender: "female",      // 기본값 (setup 페이지에서 사용자 입력으로 덮어씌워짐)
    occupation: "worker",  // 기본값
    subInfo: "",           // 기본값
    dayJob: dayJobPool[idx],
    oneLine: "당신의 새로운 인생 드라마가 시작됩니다.",
  };
}