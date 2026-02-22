import { ValueKey, SetupAnswer, ValuesProfile, Protagonist } from "./types";

export const QUESTIONS = [
  {
    id: "q1",
    title: "성공의 정의",
    prompt: "당신에게 '성공'이란 어떤 의미에 가장 가깝습니까?",
    choices: [
      { id: "c1", text: "어떤 상황에도 흔들리지 않는 경제적, 환경적 기반을 갖추는 것", weights: { stability: 2, comfort: 1 } },
      { id: "c2", text: "어제보다 나은 내가 되어 내 분야에서 탁월함을 인정받는 것", weights: { growth: 2, recognition: 1 } },
      { id: "c3", text: "사랑하는 사람들과 갈등 없이 깊게 연결되어 있는 상태", weights: { connection: 2, comfort: 1 } },
      { id: "c4", text: "조직이나 타인의 억압 없이 내가 내 시간을 온전히 통제하는 것", weights: { freedom: 2, growth: 1 } },
    ],
  },
  {
    id: "q2",
    title: "갈등 상황",
    prompt: "중요한 프로젝트 마감일, 팀원의 치명적인 실수를 발견했습니다. 어떻게 하시겠습니까?",
    choices: [
      { id: "c1", text: "내 성과가 무너지는 걸 볼 수 없다. 밤을 새워서라도 내가 직접 수정한다.", weights: { growth: 1, recognition: 2 } },
      { id: "c2", text: "팀원과 함께 문제를 공유하고 어떻게든 같이 해결책을 찾는다.", weights: { connection: 2, integrity: 1 } },
      { id: "c3", text: "일단 책임 소재를 명확히 하고, 상사에게 상황을 객관적으로 보고한다.", weights: { stability: 1, integrity: 2 } },
      { id: "c4", text: "스트레스 받기 싫다. 일단 내가 할 수 있는 최소한의 수습만 하고 퇴근한다.", weights: { comfort: 2, freedom: 1 } },
    ],
  },
  {
    id: "q3",
    title: "뜻밖의 여유",
    prompt: "이번 주말, 아무런 일정도 없고 연락 오는 곳도 없습니다. 무엇을 하실 건가요?",
    choices: [
      { id: "c1", text: "소파에 누워 넷플릭스를 보며 나만의 완벽한 휴식을 즐긴다.", weights: { comfort: 2, freedom: 1 } },
      { id: "c2", text: "평소 미뤄뒀던 전공 공부나 자기계발, 독서를 하며 시간을 보낸다.", weights: { growth: 2, meaning: 1 } },
      { id: "c3", text: "먼저 친구나 연인에게 연락해서 번개 만남을 제안한다.", weights: { connection: 2, recognition: 1 } },
      { id: "c4", text: "조용히 산책을 하거나 일기를 쓰며 삶의 의미를 돌아본다.", weights: { meaning: 2, integrity: 1 } },
    ],
  },
  {
    id: "q4",
    title: "거절하기 힘든 제안",
    prompt: "연봉이 지금의 2배지만, 매일 야근해야 하고 워라밸이 전혀 없는 직장에서 스카우트 제의가 왔습니다.",
    choices: [
      { id: "c1", text: "당연히 간다. 젊을 때 바짝 벌고 사회적으로 인정받는 것이 최고다.", weights: { recognition: 2, stability: 1 } },
      { id: "c2", text: "가지 않는다. 내 개인적인 시간과 자유를 뺏기는 것은 상상할 수 없다.", weights: { freedom: 2, comfort: 1 } },
      { id: "c3", text: "조건을 협상해 본다. 돈도 중요하지만 건강과 관계도 잃을 수 없다.", weights: { stability: 1, connection: 1, integrity: 1 } },
      { id: "c4", text: "그 회사의 비전이 나와 맞는지 확인한다. 의미 있는 일이라면 야근도 감수한다.", weights: { meaning: 2, growth: 1 } },
    ],
  },
  {
    id: "q5",
    title: "은밀한 유혹",
    prompt: "아무도 모르게 불법적인 경로로 큰돈을 만질 기회가 생겼습니다. 걸릴 확률은 0.1%입니다.",
    choices: [
      { id: "c1", text: "절대 하지 않는다. 내 양심과 도덕성에 흠집 내는 일은 참을 수 없다.", weights: { integrity: 3 } },
      { id: "c2", text: "조금 망설여지지만, 내 평온한 일상을 걸고 도박을 하진 않겠다.", weights: { stability: 2, comfort: 1 } },
      { id: "c3", text: "그 돈으로 사랑하는 사람들의 인생을 바꿔줄 수 있다면 눈 딱 감고 한다.", weights: { connection: 2, recognition: 1 } },
      { id: "c4", text: "걸리지 않는다면 한다. 자본주의 사회에서 경제적 자유가 곧 정답이다.", weights: { freedom: 2, recognition: 1 } },
    ],
  },
  {
    id: "q6",
    title: "소비의 기준",
    prompt: "갑자기 1,000만 원의 꽁돈이 생겼습니다. 어디에 쓰시겠습니까?",
    choices: [
      { id: "c1", text: "전액 저축하거나 안전한 우량주에 투자해서 미래를 대비한다.", weights: { stability: 2, meaning: 1 } },
      { id: "c2", text: "평소 갖고 싶었던 명품이나 외제차 렌트 등 나를 돋보이게 하는 데 쓴다.", weights: { recognition: 2, comfort: 1 } },
      { id: "c3", text: "해외 배낭여행을 떠나 새로운 경험을 하고 자유를 만끽한다.", weights: { freedom: 2, growth: 1 } },
      { id: "c4", text: "부모님께 용돈을 드리고 친구들에게 크게 한턱 낸다.", weights: { connection: 2, meaning: 1 } },
    ],
  },
  {
    id: "q7",
    title: "관계의 위기",
    prompt: "가장 친한 친구가 내가 정말 싫어하는 사람과 연인이 되었습니다. 친구가 소개 자리를 만들려고 합니다.",
    choices: [
      { id: "c1", text: "친구의 선택을 존중하며 기꺼이 만나서 축하해 준다.", weights: { connection: 2, comfort: 1 } },
      { id: "c2", text: "적당히 핑계를 대고 자리를 피한다. 내 마음이 불편한 건 싫다.", weights: { comfort: 2, freedom: 1 } },
      { id: "c3", text: "친구에게 솔직하게 내 감정을 말하고 당분간 거리를 둔다.", weights: { integrity: 2, stability: 1 } },
      { id: "c4", text: "만나서 그 사람의 됨됨이를 냉정하게 평가해 보고 친구에게 조언한다.", weights: { meaning: 1, recognition: 1 } },
    ],
  },
  {
    id: "q8",
    title: "실패를 대하는 자세",
    prompt: "1년을 준비한 중요한 시험이나 오디션에서 최종 탈락했습니다. 당장 드는 생각은?",
    choices: [
      { id: "c1", text: "'어디서부터 잘못됐지?' 치열하게 원인을 분석하고 다시 도전할 계획을 짠다.", weights: { growth: 2, recognition: 1 } },
      { id: "c2", text: "'이 길은 내 길이 아닌가 보다.' 미련 없이 훌훌 털고 다른 자유로운 길을 찾는다.", weights: { freedom: 2, comfort: 1 } },
      { id: "c3", text: "'주변 사람들에게 뭐라고 말하지...' 사람들의 실망어린 시선이 가장 두렵다.", weights: { recognition: 2, connection: 1 } },
      { id: "c4", text: "'과정 자체로 의미가 있었어.' 슬프지만 이 경험이 내 인생의 자양분이 될 거라 믿는다.", weights: { meaning: 2, integrity: 1 } },
    ],
  },
  {
    id: "q9",
    title: "행복의 순간",
    prompt: "당신이 살아있음을 느끼고 가장 행복한 순간은 언제인가요?",
    choices: [
      { id: "c1", text: "어려운 문제를 내 힘으로 해결하고 한 단계 성장했음을 느낄 때", weights: { growth: 2, meaning: 1 } },
      { id: "c2", text: "아무런 알람 없이 푹 자고 일어나서 마시는 나른하고 따뜻한 커피 한 잔", weights: { comfort: 2, stability: 1 } },
      { id: "c3", text: "많은 사람들 앞에서 내 성과를 발표하고 뜨거운 박수갈채를 받을 때", weights: { recognition: 2, meaning: 1 } },
      { id: "c4", text: "사랑하는 사람과 함께 아름다운 경치를 보며 말없이 손을 잡고 있을 때", weights: { connection: 2, comfort: 1 } },
    ],
  },
  {
    id: "q10",
    title: "인생의 마지막 날",
    prompt: "내일이 당신의 인생 마지막 날입니다. 당신의 묘비명에 적히고 싶은 한 줄은?",
    choices: [
      { id: "c1", text: "'누구의 눈치도 보지 않고 바람처럼 자유롭게 살다 간 사람'", weights: { freedom: 3 } },
      { id: "c2", text: "'세상에 작지만 선하고 의미 있는 발자취를 남기고 간 사람'", weights: { meaning: 2, integrity: 1 } },
      { id: "c3", text: "'수많은 사람들에게 진심으로 사랑받고, 또 열렬히 사랑했던 사람'", weights: { connection: 3 } },
      { id: "c4", text: "'자신의 한계를 끊임없이 돌파하며 탁월한 업적을 이룬 사람'", weights: { recognition: 2, growth: 1 } },
    ],
  },
];

const VALUE_KO: Record<ValueKey, string> = {
  stability: "안정",
  growth: "성장",
  connection: "유대감",
  freedom: "자유",
  recognition: "인정",
  meaning: "의미",
  comfort: "편안함",
  integrity: "정직성",
};

export function buildValuesProfile(answers: SetupAnswer[]): ValuesProfile {
  const sum: Record<ValueKey, number> = {
    stability: 0, growth: 0, connection: 0, freedom: 0,
    recognition: 0, meaning: 0, comfort: 0, integrity: 0,
  };
  for (const a of answers) {
    if (!a.weights) continue;
    for (const [k, v] of Object.entries(a.weights)) {
      sum[k as ValueKey] += v as number;
    }
  }

  const sorted = Object.entries(sum).sort((a, b) => b[1] - a[1]);
  const topValues = sorted.slice(0, 3).map((x) => x[0] as ValueKey);

  const v1 = VALUE_KO[topValues[0]];
  const v2 = VALUE_KO[topValues[1]];
  const v3 = VALUE_KO[topValues[2]];

  // ✅ 자연스러운 선호도 문장으로 수정
  const summaryKo = `당신은 '${v1}', '${v2}', '${v3}'을(를) 추구하고 선호하는 사람입니다.`;

  return { weights: sum, topValues, summaryKo };
}

export function buildProtagonist(answers: SetupAnswer[]): Protagonist {
  const tone = answers.length % 2 === 0 ? "warm" : "dry";
  return {
    tone,
    ageBand: "20대",
    gender: "female",
    occupation: "student",
    subInfo: "",
    dayJob: "대학생",
    oneLine: "당신의 새로운 인생 드라마가 시작됩니다.",
  };
}