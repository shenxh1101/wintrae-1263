export interface AudioContent {
  text: string;
  audioPath?: string;
  duration?: number;
}

export interface MultilingualAudio {
  [language: string]: AudioContent;
}

export interface Exhibit {
  id: string;
  exhibitionId: string;
  code: string;
  title: string;
  description: string;
  coverImage?: string;
  suggestedDuration: number;
  isHighlight: boolean;
  standardAudio: MultilingualAudio;
  childAudio?: MultilingualAudio;
  extendedStories?: ExtendedStory[];
  createdAt: number;
  updatedAt: number;
}

export interface ExtendedStory {
  id: string;
  title: string;
  content: string;
  audio?: MultilingualAudio;
}

export interface RouteItem {
  id: string;
  exhibitId: string;
  hall: string;
  order: number;
}

export interface Exhibition {
  id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  halls: string[];
  exhibits: Exhibit[];
  route: RouteItem[];
  createdAt: number;
  updatedAt: number;
  isTemplate?: boolean;
}

export type AppWindow = 'overview' | 'exhibit' | 'route' | 'preview';

export interface AppState {
  exhibitions: Exhibition[];
  currentExhibitionId: string | null;
  currentWindow: AppWindow;
  currentExhibitId: string | null;
  selectedLanguages: string[];
}

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
];

export const DEFAULT_LANGUAGE = 'zh-CN';
