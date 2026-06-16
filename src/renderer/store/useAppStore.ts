import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppState,
  AppWindow,
  Exhibition,
  Exhibit,
  RouteItem,
  DEFAULT_LANGUAGE,
  MultilingualAudio,
} from '@shared/types';
import {
  createExhibition,
  createExhibit,
  cloneExhibition,
  generateId,
  createEmptyAudio,
  ExportBatchRecord,
} from '@shared/utils';

interface StoreState extends AppState {
  setCurrentWindow: (window: AppWindow) => void;
  setCurrentExhibition: (id: string | null) => void;
  setCurrentExhibit: (id: string | null) => void;
  setSelectedLanguages: (langs: string[]) => void;
  addExhibition: (name: string, description?: string) => void;
  updateExhibition: (id: string, data: Partial<Exhibition>) => void;
  deleteExhibition: (id: string) => void;
  duplicateExhibition: (id: string, newName: string) => void;
  addExhibit: (exhibitionId: string) => void;
  updateExhibit: (exhibitionId: string, exhibitId: string, data: Partial<Exhibit>) => void;
  deleteExhibit: (exhibitionId: string, exhibitId: string) => void;
  updateExhibitAudio: (
    exhibitionId: string,
    exhibitId: string,
    audioType: 'standardAudio' | 'childAudio',
    language: string,
    data: { text?: string; audioPath?: string }
  ) => void;
  toggleChildAudio: (exhibitionId: string, exhibitId: string, enabled: boolean) => void;
  addExtendedStory: (exhibitionId: string, exhibitId: string) => void;
  updateExtendedStory: (
    exhibitionId: string,
    exhibitId: string,
    storyId: string,
    data: Partial<{ title: string; content: string; audio: MultilingualAudio }>
  ) => void;
  deleteExtendedStory: (exhibitionId: string, exhibitId: string, storyId: string) => void;
  addRouteItem: (exhibitionId: string, exhibitId: string, hall: string) => void;
  removeRouteItem: (exhibitionId: string, routeItemId: string) => void;
  reorderRoute: (exhibitionId: string, items: RouteItem[]) => void;
  updateRouteItemHall: (exhibitionId: string, routeItemId: string, hall: string) => void;
  getCurrentExhibition: () => Exhibition | undefined;
  getCurrentExhibit: () => Exhibit | undefined;
  exportBatchHistory: ExportBatchRecord[];
  addExportBatch: (batch: ExportBatchRecord) => void;
  clearExportBatchHistory: (exhibitionId?: string) => void;
}

export const useAppStore = create<StoreState>()(
  persist(
    (set, get) => ({
      exhibitions: [],
      currentExhibitionId: null,
      currentWindow: 'overview',
      currentExhibitId: null,
      selectedLanguages: [DEFAULT_LANGUAGE],
      exportBatchHistory: [],

      addExportBatch: (batch) =>
        set((state) => ({ exportBatchHistory: [batch, ...state.exportBatchHistory].slice(0, 200) })),
      clearExportBatchHistory: (exhibitionId) =>
        set((state) => ({
          exportBatchHistory: exhibitionId
            ? state.exportBatchHistory.filter((b) => b.exhibitionId !== exhibitionId)
            : [],
        })),

      setCurrentWindow: (window) => set({ currentWindow: window }),
      setCurrentExhibition: (id) => set({ currentExhibitionId: id, currentExhibitId: null }),
      setCurrentExhibit: (id) => set({ currentExhibitId: id }),
      setSelectedLanguages: (langs) => set({ selectedLanguages: langs }),

      addExhibition: (name, description = '') => {
        const newExhibition = createExhibition(name, description);
        set((state) => ({
          exhibitions: [...state.exhibitions, newExhibition],
          currentExhibitionId: newExhibition.id,
        }));
      },

      updateExhibition: (id, data) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === id ? { ...ex, ...data, updatedAt: Date.now() } : ex
          ),
        }));
      },

      deleteExhibition: (id) => {
        set((state) => ({
          exhibitions: state.exhibitions.filter((ex) => ex.id !== id),
          currentExhibitionId: state.currentExhibitionId === id ? null : state.currentExhibitionId,
        }));
      },

      duplicateExhibition: (id, newName) => {
        const original = get().exhibitions.find((ex) => ex.id === id);
        if (original) {
          const cloned = cloneExhibition(original, newName);
          set((state) => ({
            exhibitions: [...state.exhibitions, cloned],
            currentExhibitionId: cloned.id,
          }));
        }
      },

      addExhibit: (exhibitionId) => {
        const newExhibit = createExhibit(exhibitionId);
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? { ...ex, exhibits: [...ex.exhibits, newExhibit], updatedAt: Date.now() }
              : ex
          ),
          currentExhibitId: newExhibit.id,
        }));
      },

      updateExhibit: (exhibitionId, exhibitId, data) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) =>
                    exh.id === exhibitId ? { ...exh, ...data, updatedAt: Date.now() } : exh
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      deleteExhibit: (exhibitionId, exhibitId) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.filter((exh) => exh.id !== exhibitId),
                  route: ex.route.filter((r) => r.exhibitId !== exhibitId),
                  updatedAt: Date.now(),
                }
              : ex
          ),
          currentExhibitId:
            state.currentExhibitId === exhibitId ? null : state.currentExhibitId,
        }));
      },

      updateExhibitAudio: (exhibitionId, exhibitId, audioType, language, data) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) => {
                    if (exh.id !== exhibitId) return exh;
                    const currentAudio = exh[audioType] || {};
                    const langAudio = currentAudio[language] || { text: '', audioPath: undefined };
                    return {
                      ...exh,
                      [audioType]: {
                        ...currentAudio,
                        [language]: { ...langAudio, ...data },
                      },
                      updatedAt: Date.now(),
                    };
                  }),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      toggleChildAudio: (exhibitionId, exhibitId, enabled) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) =>
                    exh.id === exhibitId
                      ? {
                          ...exh,
                          childAudio: enabled ? createEmptyAudio() : undefined,
                          updatedAt: Date.now(),
                        }
                      : exh
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      addExtendedStory: (exhibitionId, exhibitId) => {
        const newStory = {
          id: generateId(),
          title: '',
          content: '',
          audio: createEmptyAudio(),
        };
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) =>
                    exh.id === exhibitId
                      ? {
                          ...exh,
                          extendedStories: [...(exh.extendedStories || []), newStory],
                          updatedAt: Date.now(),
                        }
                      : exh
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      updateExtendedStory: (exhibitionId, exhibitId, storyId, data) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) =>
                    exh.id === exhibitId
                      ? {
                          ...exh,
                          extendedStories: (exh.extendedStories || []).map((s) =>
                            s.id === storyId ? { ...s, ...data } : s
                          ),
                          updatedAt: Date.now(),
                        }
                      : exh
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      deleteExtendedStory: (exhibitionId, exhibitId, storyId) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  exhibits: ex.exhibits.map((exh) =>
                    exh.id === exhibitId
                      ? {
                          ...exh,
                          extendedStories: (exh.extendedStories || []).filter(
                            (s) => s.id !== storyId
                          ),
                          updatedAt: Date.now(),
                        }
                      : exh
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      addRouteItem: (exhibitionId, exhibitId, hall) => {
        const state = get();
        const exhibition = state.exhibitions.find((ex) => ex.id === exhibitionId);
        if (!exhibition) return;

        const maxOrder = exhibition.route.reduce((max, r) => Math.max(max, r.order), -1);
        const newItem: RouteItem = {
          id: generateId(),
          exhibitId,
          hall,
          order: maxOrder + 1,
        };

        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? { ...ex, route: [...ex.route, newItem], updatedAt: Date.now() }
              : ex
          ),
        }));
      },

      removeRouteItem: (exhibitionId, routeItemId) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  route: ex.route.filter((r) => r.id !== routeItemId),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      reorderRoute: (exhibitionId, items) => {
        const reordered = items.map((item, index) => ({ ...item, order: index }));
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId ? { ...ex, route: reordered, updatedAt: Date.now() } : ex
          ),
        }));
      },

      updateRouteItemHall: (exhibitionId, routeItemId, hall) => {
        set((state) => ({
          exhibitions: state.exhibitions.map((ex) =>
            ex.id === exhibitionId
              ? {
                  ...ex,
                  route: ex.route.map((r) =>
                    r.id === routeItemId ? { ...r, hall } : r
                  ),
                  updatedAt: Date.now(),
                }
              : ex
          ),
        }));
      },

      getCurrentExhibition: () => {
        const state = get();
        return state.exhibitions.find((ex) => ex.id === state.currentExhibitionId);
      },

      getCurrentExhibit: () => {
        const state = get();
        const exhibition = state.exhibitions.find((ex) => ex.id === state.currentExhibitionId);
        return exhibition?.exhibits.find((exh) => exh.id === state.currentExhibitId);
      },
    }),
    {
      name: 'museum-audio-guide-storage',
    }
  )
);
