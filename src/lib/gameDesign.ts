import { ValueKey, SetupAnswer, ValuesProfile, Protagonist } from "./types";

// 에니어그램 기반 9가지 핵심 가치관 매핑
const VALUE_KO: Record<ValueKey, string> = {
  perfection: "원칙과 완벽함",   // 1유형
  helpfulness: "배려와 헌신",    // 2유형
  achievement: "성취와 성공",    // 3유형
  uniqueness: "개성과 진정성",   // 4유형
  knowledge: "탐구와 지식",      // 5유형
  security: "안전과 충실함",     // 6유형
  enjoyment: "자유와 즐거움",    // 7유형
  power: "도전과 주도권",        // 8유형
  peace: "평화와 조화",          // 9유형
};

// 성향 1순위에 따른 동물 매핑
const ANIMAL_MAP: Record<ValueKey, { icon: string; name: string; desc: string }> = {
  perfection: { icon: "🦉", name: "올빼미", desc: "원칙을 지키며 완벽을 추구하는 지혜로운" },
  helpfulness: { icon: "🐶", name: "리트리버", desc: "타인을 돕고 배려심이 깊은 다정한" },
  achievement: { icon: "🦅", name: "독수리", desc: "높은 목표를 향해 거침없이 비상하는" },
  uniqueness: { icon: "🐈", name: "고양이", desc: "자신만의 색깔과 개성이 뚜렷한 매력적인" },
  knowledge: { icon: "🦊", name: "여우", desc: "세상을 깊이 관찰하고 탐구하는 예리한" },
  security: { icon: "🦌", name: "사슴", desc: "신중하고 책임감 있게 무리를 지키는 충실한" },
  enjoyment: { icon: "🐬", name: "돌고래", desc: "틀에 얽매이지 않고 호기심 가득한 자유로운" },
  power: { icon: "🦁", name: "사자", desc: "두려움 없이 도전하며 상황을 주도하는 당당한" },
  peace: { icon: "🐼", name: "판다", desc: "어떤 상황에서도 평온하게 조화를 이루는" },
};

export const QUESTIONS = [
  {
    id: "q1",
    title: "삶의 궁극적인 동기",
    prompt: "당신이 살아가는 데 있어서 가장 중요하게 생각하는 핵심 가치는 무엇입니까?",
    choices: [
      { id: "c1", text: "모든 일이 올바른 원칙대로 완벽하게 처리되는 것", weights: { perfection: 2, security: 1 } },
      { id: "c2", text: "타인에게 인정받고 내 분야에서 뛰어난 성취를 이루는 것", weights: { achievement: 2, power: 1 } },
      { id: "c3", text: "세상의 이치를 깊이 이해하고 통찰력 있는 지식을 얻는 것", weights: { knowledge: 2, uniqueness: 1 } },
      { id: "c4", text: "갈등 없이 마음이 평온하며 사람들과 조화롭게 지내는 것", weights: { peace: 2, helpfulness: 1 } },
    ],
  },
  {
    id: "q2",
    title: "위기 대처 방식",
    prompt: "예상치 못한 큰 문제나 스트레스 상황에 직면했을 때, 당신의 첫 반응은?",
    choices: [
      { id: "c1", text: "주변 사람들을 챙기고, 함께 관계를 다지며 문제를 극복한다.", weights: { helpfulness: 2, peace: 1 } },
      { id: "c2", text: "나만의 공간에 들어가 내면의 감정을 살피고 상황의 의미를 찾는다.", weights: { uniqueness: 2, knowledge: 1 } },
      { id: "c3", text: "최악의 상황을 대비해 철저히 계획을 세우고 안전한 길을 모색한다.", weights: { security: 2, perfection: 1 } },
      { id: "c4", text: "정면으로 부딪혀 주도권을 잡고 즉시 상황을 통제하려 든다.", weights: { power: 2, achievement: 1 } },
    ],
  },
  {
    id: "q3",
    title: "이상적인 휴일",
    prompt: "아무 제약이 없는 완벽한 주말이 주어졌습니다. 어떻게 시간을 보내시겠습니까?",
    choices: [
      { id: "c1", text: "평소 해보지 못했던 새롭고 흥미로운 모험이나 액티비티를 즐긴다.", weights: { enjoyment: 2, uniqueness: 1 } },
      { id: "c2", text: "계획했던 집안일이나 자기계발을 오차 없이 끝내고 뿌듯함을 느낀다.", weights: { perfection: 2, achievement: 1 } },
      { id: "c3", text: "혼자만의 조용한 공간에서 책을 읽거나 내 관심 분야를 깊게 파고든다.", weights: { knowledge: 2, peace: 1 } },
      { id: "c4", text: "소중한 사람들을 초대해 맛있는 것을 대접하며 따뜻한 시간을 보낸다.", weights: { helpfulness: 2, peace: 1 } },
    ],
  },
  {
    id: "q4",
    title: "조직 내 우선순위",
    prompt: "직장이나 학교(조별과제)에서 당신이 가장 선호하는 환경은 어떤 곳입니까?",
    choices: [
      { id: "c1", text: "나의 능력과 성과가 확실하게 평가받고 확실한 보상이 주어지는 곳", weights: { achievement: 2, power: 1 } },
      { id: "c2", text: "규정과 매뉴얼이 명확하여 예측 가능하고 안정적인 환경", weights: { security: 2, perfection: 1 } },
      { id: "c3", text: "경쟁보다는 서로 돕고 화합하며 소외되는 사람이 없는 따뜻한 분위기", weights: { peace: 2, helpfulness: 1 } },
      { id: "c4", text: "남들이 시도하지 않은 독창적이고 창의적인 아이디어를 낼 수 있는 곳", weights: { uniqueness: 2, enjoyment: 1 } },
    ],
  },
  {
    id: "q5",
    title: "문제 해결의 첫 마디",
    prompt: "팀 프로젝트가 엎어질 위기입니다. 당신의 입에서 가장 먼저 나올 법한 말은?",
    choices: [
      { id: "c1", text: "'내가 총대 멜게.' 즉시 앞장서서 명확한 지시를 내린다.", weights: { power: 2, achievement: 1 } },
      { id: "c2", text: "'일단 진정하자.' 분위기를 환기하고 긍정적인 방향을 제시한다.", weights: { enjoyment: 2, peace: 1 } },
      { id: "c3", text: "'원인이 뭘까?' 객관적인 데이터를 모으고 냉정하게 분석한다.", weights: { knowledge: 2, perfection: 1 } },
      { id: "c4", text: "'다들 괜찮아?' 상처받은 팀원들의 감정을 먼저 살피고 위로한다.", weights: { helpfulness: 2, peace: 1 } },
    ],
  },
  {
    id: "q6",
    title: "분노의 버튼",
    prompt: "당신을 가장 화나게 만들고 참을 수 없게 하는 상황은 언제입니까?",
    choices: [
      { id: "c1", text: "사람들이 무책임하게 행동하고 당연한 규칙을 어기며 피해를 줄 때", weights: { perfection: 2, security: 1 } },
      { id: "c2", text: "나의 뼈를 깎는 노력이나 능력을 제대로 인정해주지 않고 무시할 때", weights: { achievement: 2, uniqueness: 1 } },
      { id: "c3", text: "누군가 내 영역을 침범하고 나를 마음대로 통제하거나 억압하려 들 때", weights: { power: 2, enjoyment: 1 } },
      { id: "c4", text: "내 진심을 오해하거나, 나를 너무 평범하고 진부한 사람 취급할 때", weights: { uniqueness: 2, knowledge: 1 } },
    ],
  },
  {
    id: "q7",
    title: "중대한 결정의 순간",
    prompt: "인생을 좌우할 중요한 선택의 기로에 섰습니다. 당신은 어떻게 결정합니까?",
    choices: [
      { id: "c1", text: "믿을 수 있는 멘토나 신뢰하는 사람들의 조언을 두루 구한다.", weights: { security: 2, helpfulness: 1 } },
      { id: "c2", text: "남들의 말보다는 내 직관과 내면의 깊은 울림에 따라 결정한다.", weights: { uniqueness: 2, peace: 1 } },
      { id: "c3", text: "철저한 자료 조사와 논리적인 타당성을 바탕으로 득실을 계산한다.", weights: { knowledge: 2, security: 1 } },
      { id: "c4", text: "어느 쪽이 더 재미있고 내 가슴을 뛰게 하는지를 최우선으로 본다.", weights: { enjoyment: 2, achievement: 1 } },
    ],
  },
  {
    id: "q8",
    title: "숨기고 싶은 이면",
    prompt: "당신이 남들에게는 최대한 들키고 싶지 않은 나의 이면은 무엇입니까?",
    choices: [
      { id: "c1", text: "가끔 나를 짓누르는 깊은 우울감이나 세상에 대한 공허함", weights: { uniqueness: 2, peace: 1 } },
      { id: "c2", text: "실패에 대한 두려움이나 나의 약하고 무능해 보이는 모습", weights: { power: 2, achievement: 1 } },
      { id: "c3", text: "타인의 결점이 보일 때마다 속으로 솟구치는 비판적인 생각과 분노", weights: { perfection: 2, knowledge: 1 } },
      { id: "c4", text: "무언가에 깊게 얽매이거나 무거운 책임을 져야 한다는 두려움", weights: { enjoyment: 2, knowledge: 1 } },
    ],
  },
  {
    id: "q9",
    title: "그룹 내 포지션",
    prompt: "다수의 사람들이 모인 그룹에서 당신은 주로 어떤 역할을 맡습니까?",
    choices: [
      { id: "c1", text: "뚜렷한 목표를 제시하고 효율적으로 팀을 이끄는 리더", weights: { achievement: 2, power: 1 } },
      { id: "c2", text: "갈등을 중재하고 서로의 의견을 부드럽게 조율하는 피스메이커", weights: { peace: 2, helpfulness: 1 } },
      { id: "c3", text: "눈에 띄지 않더라도 궂은일을 도맡아 하며 사람들을 챙기는 서포터", weights: { helpfulness: 2, security: 1 } },
      { id: "c4", text: "남들이 간과하는 리스크와 문제점을 예리하게 짚어내는 조언자", weights: { security: 2, perfection: 1 } },
    ],
  },
  {
    id: "q10",
    title: "인생의 최종 목표",
    prompt: "당신의 인생이 한 편의 책이라면, 마지막 장에 어떤 내용이 남기를 원하나요?",
    choices: [
      { id: "c1", text: "누구에게도 굴복하지 않고 내 운명을 스스로 개척한 강인한 서사", weights: { power: 2, enjoyment: 1 } },
      { id: "c2", text: "우주의 원리나 내 분야의 궁극적인 진리를 마침내 깨달았다는 기록", weights: { knowledge: 2, uniqueness: 1 } },
      { id: "c3", text: "타인을 돕고 사회에 올바르고 긍정적인 발자취를 남겼다는 찬사", weights: { perfection: 2, helpfulness: 1 } },
      { id: "c4", text: "모든 갈등을 내려놓고 세상과 온전히 하나가 되었다는 평온한 결말", weights: { peace: 2, security: 1 } },
    ],
  },
];

export function buildValuesProfile(answers: SetupAnswer[]): ValuesProfile {
  // 9가지 에니어그램 유형으로 초기화
  const sum: Record<ValueKey, number> = {
    perfection: 0,
    helpfulness: 0,
    achievement: 0,
    uniqueness: 0,
    knowledge: 0,
    security: 0,
    enjoyment: 0,
    power: 0,
    peace: 0,
  };

  for (const a of answers) {
    if (!a.weights) continue;
    for (const [k, v] of Object.entries(a.weights)) {
      sum[k as ValueKey] += v as number;
    }
  }

  // 값이 높은 순서대로 정렬
  const sorted = Object.entries(sum).sort((a, b) => b[1] - a[1]);
  const topValues = sorted.slice(0, 3).map((x) => x[0] as ValueKey);

  const v1 = VALUE_KO[topValues[0]];
  const v2 = VALUE_KO[topValues[1]];
  const v3 = VALUE_KO[topValues[2]];

  const summaryKo = `당신은 '${v1}', '${v2}', '${v3}'을(를) 깊이 추구하는 성향을 가졌습니다.`;
  
  // 1순위 성향을 바탕으로 동물 매핑
  const animal = ANIMAL_MAP[topValues[0]];

  return { weights: sum, topValues, summaryKo, animal };
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