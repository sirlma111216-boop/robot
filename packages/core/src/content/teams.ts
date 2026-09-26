// 팀 식별: 색 + 문양 + 번호 (색만으로 구분하지 않는다)
export interface TeamStyle { index: number; color: string; dark: string; name: string; pattern: 'solid' | 'stripe' | 'dots' | 'ring' | 'chevron' | 'cross' }

export const TEAM_STYLES: TeamStyle[] = [
  { index: 1, color: '#ff5c5c', dark: '#8f1f1f', name: '레드', pattern: 'solid' },
  { index: 2, color: '#4d9dff', dark: '#173f7a', name: '블루', pattern: 'stripe' },
  { index: 3, color: '#ffd43d', dark: '#8a6a00', name: '옐로', pattern: 'dots' },
  { index: 4, color: '#3fe08a', dark: '#106b3c', name: '그린', pattern: 'ring' },
  { index: 5, color: '#c47cff', dark: '#5a2a8f', name: '퍼플', pattern: 'chevron' },
  { index: 6, color: '#ff9440', dark: '#8a4210', name: '오렌지', pattern: 'cross' },
];

export const MAX_TEAMS = 6;
export const MAX_STUDENTS = 30;
export const DEFAULT_MAX_TEAM_SIZE = 6;

export const TEAM_NAME_POOL = ['볼트 헌터즈', '러스트 타이거', '네온 스파크', '스틸 크라운', '고철 늑대', '테슬라 키즈', '스크랩 러너', '아이언 펭귄', '터보 너트', '앰버 드릴'];
