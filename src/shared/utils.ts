import { Exhibition, Exhibit, DEFAULT_LANGUAGE, MultilingualAudio } from './types';

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

export const checkMissingAudio = (
  exhibit: Exhibit,
  languages: string[]
): { standard: string[]; child: string[]; extended: { title: string; missing: string[] }[] } => {
  const standardMissing = languages.filter(
    (lang) => !exhibit.standardAudio[lang]?.audioPath && !exhibit.standardAudio[lang]?.text
  );
  const childMissing = languages.filter(
    (lang) => exhibit.childAudio && (!exhibit.childAudio[lang]?.audioPath && !exhibit.childAudio[lang]?.text)
  );
  const extendedMissing =
    exhibit.extendedStories?.map((story) => ({
      title: story.title,
      missing: languages.filter(
        (lang) => story.audio && (!story.audio[lang]?.audioPath && !story.audio[lang]?.text)
      ),
    })) || [];

  return {
    standard: standardMissing,
    child: childMissing,
    extended: extendedMissing,
  };
};

export const exportChecklist = (exhibition: Exhibition, languages: string[]): string => {
  let csv = '编号,展品名称,展厅,建议时长(秒),';
  csv += languages.map((l) => `${l}标准讲解`).join(',');
  csv += ',';
  csv += languages.map((l) => `${l}儿童讲解`).join(',');
  csv += '\n';

  const routeMap = new Map(exhibition.route.map((r) => [r.exhibitId, r]));

  exhibition.exhibits.forEach((exhibit) => {
    const route = routeMap.get(exhibit.id);
    const row = [
      exhibit.code,
      `"${exhibit.title.replace(/"/g, '""')}"`,
      route?.hall || '',
      exhibit.suggestedDuration,
    ];

    languages.forEach((lang) => {
      const hasStandard = exhibit.standardAudio[lang]?.text || exhibit.standardAudio[lang]?.audioPath;
      row.push(hasStandard ? '✓' : '✗');
    });

    languages.forEach((lang) => {
      const hasChild = exhibit.childAudio?.[lang]?.text || exhibit.childAudio?.[lang]?.audioPath;
      row.push(hasChild ? '✓' : '✗');
    });

    csv += row.join(',') + '\n';
  });

  return csv;
};
