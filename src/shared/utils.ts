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
  isPathValid?: boolean;
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
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): { [language: string]: AudioStatusDetail } => {
  const result: { [language: string]: AudioStatusDetail } = {};
  languages.forEach((lang) => {
    const langAudio = audio?.[lang];
    const hasPath = !!(langAudio?.audioPath && langAudio.audioPath.length > 0);
    const isPathValid = hasPath
      ? fileValidity
        ? !!fileValidity[langAudio!.audioPath!]
        : undefined
      : undefined;
    const hasAudio = hasPath && (fileValidity ? !!fileValidity[langAudio!.audioPath!] : true);
    result[lang] = {
      hasText: !!(langAudio?.text && langAudio.text.trim().length > 0),
      hasAudio,
      isPathValid,
      isComplete: hasAudio,
    };
  });
  return result;
};

export const getExhibitAudioStatus = (
  exhibit: Exhibit,
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): ExhibitAudioStatus => {
  return {
    standard: getAudioStatus(exhibit.standardAudio, languages, fileValidity),
    child: exhibit.childAudio ? getAudioStatus(exhibit.childAudio, languages, fileValidity) : null,
    extended:
      exhibit.extendedStories?.map((story) => ({
        storyId: story.id,
        title: story.title,
        audio: getAudioStatus(story.audio, languages, fileValidity),
      })) || [],
  };
};

export const collectAllAudioPaths = (exhibits: Exhibit[]): string[] => {
  const paths = new Set<string>();
  exhibits.forEach((exhibit) => {
    Object.values(exhibit.standardAudio).forEach((a) => a.audioPath && paths.add(a.audioPath));
    if (exhibit.childAudio) {
      Object.values(exhibit.childAudio).forEach((a) => a.audioPath && paths.add(a.audioPath));
    }
    exhibit.extendedStories?.forEach((story) => {
      if (story.audio) {
        Object.values(story.audio).forEach((a) => a.audioPath && paths.add(a.audioPath));
      }
    });
  });
  return Array.from(paths);
};

export const checkMissingAudio = (
  exhibit: Exhibit,
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): {
  standard: string[];
  child: string[];
  extended: { title: string; missing: string[]; broken: string[] }[];
  brokenStandard: string[];
  brokenChild: string[];
} => {
  const status = getExhibitAudioStatus(exhibit, languages, fileValidity);

  const standardMissing = languages.filter((lang) => !status.standard[lang].isComplete);
  const standardBroken = languages.filter(
    (lang) => !status.standard[lang].isComplete && status.standard[lang].isPathValid === false
  );
  const childMissing = status.child
    ? languages.filter((lang) => !status.child![lang].isComplete)
    : [];
  const childBroken = status.child
    ? languages.filter(
        (lang) => !status.child![lang].isComplete && status.child![lang].isPathValid === false
      )
    : [];
  const extendedMissing = status.extended.map((story) => ({
    title: story.title,
    missing: languages.filter((lang) => !story.audio[lang].isComplete),
    broken: languages.filter(
      (lang) => !story.audio[lang].isComplete && story.audio[lang].isPathValid === false
    ),
  }));

  return {
    standard: standardMissing,
    child: childMissing,
    extended: extendedMissing,
    brokenStandard: standardBroken,
    brokenChild: childBroken,
  };
};

export const hasAudioFile = (
  exhibit: Exhibit,
  language: string,
  mode: 'standard' | 'child',
  fileValidity?: { [path: string]: boolean }
): boolean => {
  let path: string | undefined;
  if (mode === 'standard') {
    path = exhibit.standardAudio[language]?.audioPath;
  } else {
    path = exhibit.childAudio?.[language]?.audioPath;
  }
  if (!path) return false;
  return fileValidity ? !!fileValidity[path] : true;
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

export interface TourValidationSummary {
  totalNodes: number;
  exhibitsWithCover: number;
  coversMissing: number;
  standardAudioMissing: { [language: string]: number };
  childAudioMissing: { [language: string]: number };
  extendedAudioMissing: number;
  extendedAudioBroken: number;
  standardAudioBroken: number;
  childAudioBroken: number;
  brokenAudioPaths: number;
  score: number;
}

export interface ExportBatchRecord {
  id: string;
  exportedAt: number;
  exhibitionId: string;
  exhibitionName: string;
  options: TourExportOptions;
  validation: TourValidationSummary;
  filename?: string;
}

export const EMPTY_BATCH_HISTORY_KEY = 'export_batch_history_v1';

export interface TourExportOptions {
  languages: string[];
  includeStandard: boolean;
  includeChild: boolean;
  includeExtended: boolean;
  includeCovers: boolean;
  includeTranscripts: boolean;
}

export interface TourDataPackage {
  exhibitionId: string;
  exhibitionName: string;
  description: string;
  version: string;
  exportedAt: number;
  options: TourExportOptions;
  languages: string[];
  totalDuration: number;
  totalExhibits: number;
  halls: string[];
  validation: TourValidationSummary;
  route: TourDataItem[];
}

export const buildTourValidation = (
  exhibition: Exhibition,
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): TourValidationSummary => {
  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);
  let coversMissing = 0;
  let exhibitsWithCover = 0;
  const standardAudioMissing: { [language: string]: number } = {};
  const childAudioMissing: { [language: string]: number } = {};
  let extendedAudioMissing = 0;
  let extendedAudioBroken = 0;
  let standardAudioBroken = 0;
  let childAudioBroken = 0;
  let brokenAudioPaths = 0;

  languages.forEach((l) => {
    standardAudioMissing[l] = 0;
    childAudioMissing[l] = 0;
  });

  sortedRoute.forEach((routeItem) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
    if (!exhibit) return;

    if (exhibit.coverImage) {
      exhibitsWithCover++;
    } else {
      coversMissing++;
    }

    const status = getExhibitAudioStatus(exhibit, languages, fileValidity);
    languages.forEach((lang) => {
      if (!status.standard[lang].isComplete) standardAudioMissing[lang]++;
      if (status.standard[lang].isPathValid === false) {
        standardAudioBroken++;
        brokenAudioPaths++;
      }
      if (status.child) {
        if (!status.child[lang].isComplete) childAudioMissing[lang]++;
        if (status.child[lang].isPathValid === false) {
          childAudioBroken++;
          brokenAudioPaths++;
        }
      }
    });
    status.extended.forEach((story) => {
      languages.forEach((lang) => {
        if (!story.audio[lang].isComplete) extendedAudioMissing++;
        if (story.audio[lang].isPathValid === false) {
          extendedAudioBroken++;
          brokenAudioPaths++;
        }
      });
    });
  });

  const totalAudio =
    Object.values(standardAudioMissing).reduce((s, v) => s + v, 0) +
    Object.values(childAudioMissing).reduce((s, v) => s + v, 0) +
    extendedAudioMissing;
  const maxIssues = sortedRoute.length * languages.length * 3 + coversMissing;
  const score = maxIssues > 0 ? Math.round((1 - totalAudio / maxIssues) * 100) : 100;

  return {
    totalNodes: sortedRoute.length,
    exhibitsWithCover,
    coversMissing,
    standardAudioMissing,
    childAudioMissing,
    extendedAudioMissing,
    extendedAudioBroken,
    standardAudioBroken,
    childAudioBroken,
    brokenAudioPaths,
    score: Math.max(0, Math.min(100, score)),
  };
};

export const buildTourDataPackage = (
  exhibition: Exhibition,
  options: TourExportOptions,
  fileValidity?: { [path: string]: boolean }
): TourDataPackage => {
  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);

  const filterAudio = (audio: MultilingualAudio | undefined): MultilingualAudio | undefined => {
    if (!audio) return undefined;
    const result: MultilingualAudio = {};
    options.languages.forEach((lang) => {
      if (audio[lang]) {
        result[lang] = {
          text: options.includeTranscripts ? audio[lang].text : '',
          audioPath: audio[lang].audioPath,
          duration: audio[lang].duration,
        };
      }
    });
    return result;
  };

  const route = sortedRoute.map((routeItem) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId)!;
    return {
      order: routeItem.order,
      exhibitId: exhibit.id,
      code: exhibit.code,
      title: exhibit.title,
      description: exhibit.description,
      hall: routeItem.hall,
      coverImage: options.includeCovers ? exhibit.coverImage : undefined,
      suggestedDuration: exhibit.suggestedDuration,
      isHighlight: exhibit.isHighlight,
      hasChildVersion: !!exhibit.childAudio && options.includeChild,
      standardAudio: options.includeStandard
        ? (filterAudio(exhibit.standardAudio) as MultilingualAudio)
        : ({} as MultilingualAudio),
      childAudio: options.includeChild ? filterAudio(exhibit.childAudio) : undefined,
      extendedStories: options.includeExtended
        ? (exhibit.extendedStories
            ?.map((s) => ({
              ...s,
              storyId: s.id,
              content: options.includeTranscripts ? s.content : '',
              audio: filterAudio(s.audio),
            })) || [])
        : [],
    };
  });

  const totalDuration = route.reduce((sum, item) => sum + item.suggestedDuration, 0);
  const validation = buildTourValidation(exhibition, options.languages, fileValidity);

  return {
    exhibitionId: exhibition.id,
    exhibitionName: exhibition.name,
    description: exhibition.description,
    version: '1.1.0',
    exportedAt: Date.now(),
    options,
    languages: options.languages,
    totalDuration,
    totalExhibits: route.length,
    halls: exhibition.halls,
    validation,
    route,
  };
};

export const exportChecklist = (
  exhibition: Exhibition,
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): string => {
  const maxStories = Math.max(
    0,
    ...exhibition.exhibits.map((e) => (e.extendedStories?.length ? e.extendedStories.length : 0))
  );

  let csv = '序号,编号,展品名称,展厅,建议时长(秒),重点展品,封面,';
  csv += languages.map((l) => `${l}标准文本`).join(',');
  csv += ',';
  csv += languages.map((l) => `${l}标准音频`).join(',');
  csv += ',儿童版,';
  csv += languages.map((l) => `${l}儿童音频`).join(',');
  csv += ',延伸故事数';
  for (let i = 0; i < maxStories; i++) {
    csv += `,故事${i + 1}标题`;
    languages.forEach((l) => {
      csv += `,故事${i + 1}_${l}_音频`;
    });
  }
  csv += '\n';

  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);

  sortedRoute.forEach((routeItem, index) => {
    const exhibit = exhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
    if (!exhibit) return;

    const status = getExhibitAudioStatus(exhibit, languages, fileValidity);

    const row = [
      index + 1,
      exhibit.code,
      `"${exhibit.title.replace(/"/g, '""')}"`,
      routeItem.hall,
      exhibit.suggestedDuration,
      exhibit.isHighlight ? '是' : '否',
      exhibit.coverImage ? '有' : '无',
    ];

    languages.forEach((lang) => {
      row.push(status.standard[lang].hasText ? '✓' : '✗');
    });

    languages.forEach((lang) => {
      if (status.standard[lang].isPathValid === false) {
        row.push('!失效');
      } else {
        row.push(status.standard[lang].hasAudio ? '✓' : '✗');
      }
    });

    row.push(status.child ? '有' : '无');

    languages.forEach((lang) => {
      if (!status.child) {
        row.push('—');
      } else if (status.child[lang].isPathValid === false) {
        row.push('!失效');
      } else {
        row.push(status.child[lang].hasAudio ? '✓' : '✗');
      }
    });

    const storyCount = status.extended.length;
    row.push(storyCount);
    for (let i = 0; i < maxStories; i++) {
      const story = status.extended[i];
      if (!story) {
        row.push('—');
        languages.forEach(() => row.push('—'));
        continue;
      }
      row.push(`"${(story.title || '').replace(/"/g, '""')}"`);
      languages.forEach((lang) => {
        if (story.audio[lang].isPathValid === false) {
          row.push('!失效');
        } else if (story.audio[lang].hasAudio) {
          row.push('✓');
        } else if (story.audio[lang].hasText) {
          row.push('文');
        } else {
          row.push('✗');
        }
      });
    }

    csv += row.join(',') + '\n';
  });

  return csv;
};

export const exportPublishChecklist = (
  exhibition: Exhibition,
  languages: string[],
  fileValidity?: { [path: string]: boolean }
): string => {
  const sortedRoute = [...exhibition.route].sort((a, b) => a.order - b.order);
  const options = {
    languages,
    includeStandard: true,
    includeChild: true,
    includeExtended: true,
    includeCovers: true,
    includeTranscripts: true,
  };
  const pkg = buildTourDataPackage(exhibition, options, fileValidity);
  const validation = pkg.validation;

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
  content += '  数据校验摘要\n';
  content += '----------------------------------------\n';
  content += `完整度评分：${validation.score}/100\n`;
  content += `封面缺失：${validation.coversMissing} 件\n`;
  if (validation.brokenAudioPaths > 0) {
    content += `⚠️ 失效音频路径：${validation.brokenAudioPaths} 个\n`;
  }
  content += '\n';
  languages.forEach((lang) => {
    content += `  [${lang}] 标准版缺失：${validation.standardAudioMissing[lang] || 0} 件`;
    if ((validation.childAudioMissing[lang] || 0) > 0) {
      content += `，儿童版缺失：${validation.childAudioMissing[lang]} 件`;
    }
    content += '\n';
  });
  if (validation.extendedAudioMissing > 0) {
    content += `  延伸故事音频缺失：${validation.extendedAudioMissing} 项\n`;
  }
  content += '\n';

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

    const status = getExhibitAudioStatus(exhibit, languages, fileValidity);

    content += `  ${index + 1}. ${exhibit.title} (${exhibit.code})`;
    content += exhibit.isHighlight ? ' ⭐重点' : '';
    content += `  时长:${formatDuration(exhibit.suggestedDuration)}`;
    if (!exhibit.coverImage) content += ' ⚠无封面';
    content += '\n';

    languages.forEach((lang) => {
      const st = status.standard[lang];
      let mark = '✓';
      if (st.isPathValid === false) mark = '!路径失效';
      else if (!st.hasAudio && st.hasText) mark = '有文无音';
      else if (!st.hasAudio) mark = '✗缺失';
      content += `     ${lang} 标准: ${mark}`;
      if (status.child) {
        const cs = status.child[lang];
        let cmark = '✓';
        if (cs.isPathValid === false) cmark = '!路径失效';
        else if (!cs.hasAudio && cs.hasText) cmark = '有文无音';
        else if (!cs.hasAudio) cmark = '✗缺失';
        content += ` | 儿童: ${cmark}`;
      }
      content += '\n';
    });

    if (status.extended.length > 0) {
      content += `     延伸故事: ${status.extended.length} 个\n`;
      status.extended.forEach((story, si) => {
        const completeCount = languages.filter((l) => story.audio[l].hasAudio && story.audio[l].isPathValid !== false).length;
        const brokenCount = languages.filter((l) => story.audio[l].isPathValid === false).length;
        const missingCount = languages.filter((l) => !story.audio[l].hasAudio && story.audio[l].isPathValid !== false).length;
        content += `       故事${si + 1}: ${story.title}  [完整:${completeCount} 缺音:${missingCount} 失效:${brokenCount}]\n`;
        languages.forEach((lang) => {
          const es = story.audio[lang];
          let emark = '✓';
          if (es.isPathValid === false) emark = '!路径失效';
          else if (!es.hasAudio && es.hasText) emark = '有文无音';
          else if (!es.hasAudio) emark = '✗缺失';
          content += `         ${lang}: ${emark}\n`;
        });
      });
    }
    content += '\n';
  });

  content += '\n----------------------------------------\n';
  content += '  各语言完成度统计\n';
  content += '----------------------------------------\n\n';

  const allStatuses = sortedRoute
    .map((r) => exhibition.exhibits.find((e) => e.id === r.exhibitId))
    .filter(Boolean)
    .map((e) => getExhibitAudioStatus(e!, languages, fileValidity));

  languages.forEach((lang) => {
    const standardComplete = allStatuses.filter((s) => s.standard[lang].isComplete).length;
    const childHas = allStatuses.filter((s) => s.child !== null).length;
    const childComplete = allStatuses.filter((s) => s.child?.[lang].isComplete).length;
    const standardBroken = allStatuses.filter(
      (s) => s.standard[lang].isPathValid === false
    ).length;
    const childBroken = allStatuses.filter((s) => s.child?.[lang].isPathValid === false).length;
    let extStoriesTotal = 0;
    let extStoriesComplete = 0;
    let extStoriesBroken = 0;
    allStatuses.forEach((s) => {
      s.extended.forEach((story) => {
        extStoriesTotal++;
        if (story.audio[lang].isComplete && story.audio[lang].isPathValid !== false) extStoriesComplete++;
        if (story.audio[lang].isPathValid === false) extStoriesBroken++;
      });
    });

    content += `【${lang}】\n`;
    content += `  标准版: ${standardComplete}/${pkg.totalExhibits} 件完整 (${Math.round(
      (standardComplete / pkg.totalExhibits) * 100
    )}%)`;
    if (standardBroken > 0) content += ` ⚠️ ${standardBroken} 件路径失效`;
    content += '\n';
    if (childHas > 0) {
      content += `  儿童版: ${childComplete}/${childHas} 件完整 (${Math.round(
        (childComplete / childHas) * 100
      )}%)`;
      if (childBroken > 0) content += ` ⚠️ ${childBroken} 件路径失效`;
      content += '\n';
    }
    if (extStoriesTotal > 0) {
      content += `  延伸故事: ${extStoriesComplete}/${extStoriesTotal} 条完整 (${Math.round(
        (extStoriesComplete / extStoriesTotal) * 100
      )}%)`;
      if (extStoriesBroken > 0) content += ` ⚠️ ${extStoriesBroken} 条路径失效`;
      content += '\n';
    }
    content += '\n';
  });

  if (validation.brokenAudioPaths > 0) {
    content += '----------------------------------------\n';
    content += '  ⚠️  失效音频路径汇总\n';
    content += '----------------------------------------\n\n';
    content += `  标准版失效: ${validation.standardAudioBroken} 个\n`;
    content += `  儿童版失效: ${validation.childAudioBroken} 个\n`;
    content += `  延伸故事失效: ${validation.extendedAudioBroken} 个\n\n`;
  }

  return content;
};
