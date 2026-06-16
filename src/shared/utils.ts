import {
  Exhibition,
  Exhibit,
  DEFAULT_LANGUAGE,
  MultilingualAudio,
  RouteItem,
  ExtendedStory,
} from './types';

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

export const createEmptyAudio = (text: string = ''): MultilingualAudio => {
  return {
    [DEFAULT_LANGUAGE]: {
      text,
    },
  };
};

export const createExhibition = (name: string, description: string = ''): Exhibition => {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    description,
    halls: ['第一展厅', '第二展厅', '第三展厅'],
    exhibits: [],
    route: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const createExhibit = (exhibitionId: string, code: string = ''): Exhibit => {
  const now = Date.now();
  return {
    id: generateId(),
    exhibitionId,
    code: code || `EX-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    title: '',
    description: '',
    suggestedDuration: 120,
    isHighlight: false,
    standardAudio: createEmptyAudio(),
    childAudio: undefined,
    extendedStories: [],
    createdAt: now,
    updatedAt: now,
  };
};

export const cloneExhibition = (original: Exhibition, newName: string): Exhibition => {
  const now = Date.now();
  const idMap = new Map<string, string>();

  const clonedExhibits = original.exhibits.map((exhibit) => {
    const newId = generateId();
    idMap.set(exhibit.id, newId);
    return {
      ...exhibit,
      id: newId,
      createdAt: now,
      updatedAt: now,
      extendedStories: exhibit.extendedStories?.map((story) => ({
        ...story,
        id: generateId(),
      })),
    };
  });

  const clonedRoute = original.route.map((item) => ({
    ...item,
    id: generateId(),
    exhibitId: idMap.get(item.exhibitId) || item.exhibitId,
  }));

  return {
    ...original,
    id: generateId(),
    name: newName,
    exhibits: clonedExhibits,
    route: clonedRoute,
    createdAt: now,
    updatedAt: now,
    isTemplate: false,
  };
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

export interface AudioStatusDetail {
  hasText: boolean;
  hasAudio: boolean;
  isComplete: boolean;
}

export interface ExhibitAudioStatus {
  standard: { [language: string]: AudioStatusDetail };
  child: { [language: string]: AudioStatusDetail } | null;
  extended: {
    storyId: string;
    title: string;
    audio: { [language: string]: AudioStatusDetail };
  }[];
}

const getAudioStatus = (
  audio: MultilingualAudio | undefined,
  languages: string[]
): { [language: string]: AudioStatusDetail } => {
  const result: { [language: string]: AudioStatusDetail } = {};
  languages.forEach((lang) => {
    const langAudio = audio?.[lang];
    result[lang] = {
      hasText: !!(langAudio?.text && langAudio.text.trim().length > 0),
      hasAudio: !!(langAudio?.audioPath && langAudio.audioPath.length > 0),
      isComplete: !!(
        langAudio?.audioPath &&
        langAudio.audioPath.length > 0
      ),
    };
  });
  return result;
};

export const getExhibitAudioStatus = (
  exhibit: Exhibit,
  languages: string[]
): ExhibitAudioStatus => {
  return {
    standard: getAudioStatus(exhibit.standardAudio, languages),
    child: exhibit.childAudio ? getAudioStatus(exhibit.childAudio, languages) : null,
    extended:
      exhibit.extendedStories?.map((story) => ({
        storyId: story.id,
        title: story.title,
        audio: getAudioStatus(story.audio, languages),
      })) || [],
  };
};

export const checkMissingAudio = (
  exhibit: Exhibit,
  languages: string[]
): { standard: string[]; child: string[]; extended: { title: string; missing: string[] }[] } => {
  const status = getExhibitAudioStatus(exhibit, languages);

  const standardMissing = languages.filter((lang) => !status.standard[lang].isComplete);
  const childMissing = status.child ? languages.filter((lang) => !status.child![lang].isComplete) : [];
  const extendedMissing = status.extended.map((story) => ({
    title: story.title,
    missing: languages.filter((lang) => !story.audio[lang].isComplete),
  }));

  return {
    standard: standardMissing,
    child: childMissing,
    extended: extendedMissing,
  };
};

export const hasAudioFile = (
  exhibit: Exhibit,
  language: string,
  mode: 'standard' | 'child'
): boolean => {
  if (mode === 'standard') {
    return !!(exhibit.standardAudio[language]?.audioPath);
  } else {
    return !!(exhibit.childAudio?.[language]?.audioPath);
  }
};

export interface TourDataItem {
  order: number;
  exhibitId: string;
  code: string;
  title: string;
  description: string;
  hall: string;
  coverImage?: string;
  suggestedDuration: number;
  isHighlight: boolean;
  hasChildVersion: boolean;
  standardAudio: MultilingualAudio;
  childAudio?: MultilingualAudio;
  extendedStories: (ExtendedStory & { storyId: string })[];
}

export interface TourDataPackage {
  exhibitionId: string;
  exhibitionName: string;
  description: string;
  version: string;
  exportedAt: number;
  languages: string[];
  totalDuration: number;
  totalExhibits: number;
  halls: string[];
  route: TourDataItem[];
}

export const buildTourDataPackage = (
  exhibition: Exhibition,
  languages: string[]
): TourDataPackage => {
  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);

  const route = sortedRoute.map((routeItem) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId)!;
    return {
      order: routeItem.order,
      exhibitId: exhibit.id,
      code: exhibit.code,
      title: exhibit.title,
      description: exhibit.description,
      hall: routeItem.hall,
      coverImage: exhibit.coverImage,
      suggestedDuration: exhibit.suggestedDuration,
      isHighlight: exhibit.isHighlight,
      hasChildVersion: !!exhibit.childAudio,
      standardAudio: exhibit.standardAudio,
      childAudio: exhibit.childAudio,
      extendedStories:
        exhibit.extendedStories?.map((s) => ({
          ...s,
          storyId: s.id,
        })) || [],
    };
  });

  const totalDuration = route.reduce((sum, item) => sum + item.suggestedDuration, 0);

  return {
    exhibitionId: exhibition.id,
    exhibitionName: exhibition.name,
    description: exhibition.description,
    version: '1.0.0',
    exportedAt: Date.now(),
    languages,
    totalDuration,
    totalExhibits: route.length,
    halls: exhibition.halls,
    route,
  };
};

export const exportChecklist = (exhibition: Exhibition, languages: string[]): string => {
  let csv = '序号,编号,展品名称,展厅,建议时长(秒),重点展品,';
  csv += languages.map((l) => `${l}标准文本`).join(',');
  csv += ',';
  csv += languages.map((l) => `${l}标准音频`).join(',');
  csv += ',儿童版,';
  csv += languages.map((l) => `${l}儿童音频`).join(',');
  csv += ',延伸故事数量\n';

  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);

  sortedRoute.forEach((routeItem, index) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
    if (!exhibit) return;

    const status = getExhibitAudioStatus(exhibit, languages);

    const row = [
      index + 1,
      exhibit.code,
      `"${exhibit.title.replace(/"/g, '""')}"`,
      routeItem.hall,
      exhibit.suggestedDuration,
      exhibit.isHighlight ? '是' : '否',
    ];

    languages.forEach((lang) => {
      row.push(status.standard[lang].hasText ? '✓' : '✗');
    });

    languages.forEach((lang) => {
      row.push(status.standard[lang].hasAudio ? '✓' : '✗');
    });

    row.push(status.child ? '有' : '无');

    languages.forEach((lang) => {
      row.push(status.child ? (status.child[lang].hasAudio ? '✓' : '✗') : '—');
    });

    row.push(status.extended.length);

    csv += row.join(',') + '\n';
  });

  return csv;
};

export const exportPublishChecklist = (
  exhibition: Exhibition,
  languages: string[]
): string => {
  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);
  const pkg = buildTourDataPackage(exhibition, languages);

  let content = '========================================\n';
  content += '  展览发布确认清单\n';
  content += '========================================\n\n';
  content += `展览名称：${exhibition.name}\n`;
  content += `展览简介：${exhibition.description || '（无）'}\n`;
  content += `导出时间：${new Date().toLocaleString('zh-CN')}\n`;
  content += `支持语言：${languages.join('、')}\n`;
  content += `展厅数量：${exhibition.halls.length}个 (${exhibition.halls.join('、')})\n`;
  content += `展品总数：${pkg.totalExhibits} 件\n`;
  content += `预计总时长：${formatDuration(pkg.totalDuration)}\n`;
  content += `重点展品：${exhibition.exhibits.filter((e) => e.isHighlight).length} 件\n`;
  content += `含儿童版：${exhibition.exhibits.filter((e) => e.childAudio).length} 件\n\n`;

  content += '----------------------------------------\n';
  content += '  参观路线（按顺序）\n';
  content += '----------------------------------------\n\n';

  let currentHall = '';
  sortedRoute.forEach((routeItem, index) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
    if (!exhibit) return;

    if (routeItem.hall !== currentHall) {
      currentHall = routeItem.hall;
      content += `\n【${currentHall}】\n`;
    }

    const status = getExhibitAudioStatus(exhibit, languages);
    const standardComplete = languages.every((l) => status.standard[l].isComplete);
    const childComplete = status.child ? languages.every((l) => status.child![l].isComplete) : null;

    content += `  ${index + 1}. ${exhibit.title} (${exhibit.code})`;
    content += exhibit.isHighlight ? ' ⭐重点' : '';
    content += `  时长:${formatDuration(exhibit.suggestedDuration)}\n`;
    content += `     标准版: ${standardComplete ? '✓ 完整' : '⚠ 缺失'} [${languages
      .map((l) => `${l}:${status.standard[l].hasAudio ? '音频✓' : '音频✗'}`)
      .join(' | ')}]\n`;
    if (status.child) {
      content += `     儿童版: ${childComplete ? '✓ 完整' : '⚠ 缺失'} [${languages
        .map((l) => `${l}:${status.child![l].hasAudio ? '音频✓' : '音频✗'}`)
        .join(' | ')}]\n`;
    }
    if (status.extended.length > 0) {
      content += `     延伸故事: ${status.extended.length} 个\n`;
    }
    content += '\n';
  });

  content += '\n----------------------------------------\n';
  content += '  音频完成度统计\n';
  content += '----------------------------------------\n\n';

  const allStatuses = sortedRoute
    .map((r) => exhibition.exhibits.find((e) => e.id === r.exhibitId))
    .filter(Boolean)
    .map((e) => getExhibitAudioStatus(e!, languages));

  languages.forEach((lang) => {
    const standardComplete = allStatuses.filter((s) => s.standard[lang].isComplete).length;
    const childHas = allStatuses.filter((s) => s.child !== null).length;
    const childComplete = allStatuses.filter((s) => s.child?.[lang].isComplete).length;

    content += `【${lang}】\n`;
    content += `  标准版: ${standardComplete}/${pkg.totalExhibits} 件完整 (${Math.round(
      (standardComplete / pkg.totalExhibits) * 100
    )}%)\n`;
    if (childHas > 0) {
      content += `  儿童版: ${childComplete}/${childHas} 件完整 (${Math.round(
        (childComplete / childHas) * 100
      )}%)\n`;
    }
    content += '\n';
  });

  return content;
};
