import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, Exhibit } from '@shared/types';
import {
  formatDuration,
  checkMissingAudio,
  exportChecklist,
  exportPublishChecklist,
  buildTourDataPackage,
  hasAudioFile,
  getExhibitAudioStatus,
  ExhibitAudioStatus,
  collectAllAudioPaths,
  buildTourValidation,
  TourExportOptions,
  generateId,
  ExportBatchRecord,
} from '@shared/utils';
import '../styles/preview.css';

interface TimelineItem {
  id: string;
  exhibit: Exhibit;
  hall: string;
  order: number;
  startTime: number;
  endTime: number;
  hasAudio: boolean;
  isPathBroken?: boolean;
}

type ViewMode = 'timeline' | 'check' | 'publish' | 'preview';
type ExportDialogTab = 'options' | 'history';

const LANG_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

function PreviewPanel() {
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const setCurrentWindow = useAppStore((state) => state.setCurrentWindow);
  const setCurrentExhibit = useAppStore((state) => state.setCurrentExhibit);
  const addExportBatch = useAppStore((state) => state.addExportBatch);
  const exportBatchHistory = useAppStore((state) => state.exportBatchHistory);
  const clearExportBatchHistory = useAppStore((state) => state.clearExportBatchHistory);

  const [activeLanguage, setActiveLanguage] = useState(DEFAULT_LANGUAGE);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [currentPlayIndex, setCurrentPlayIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<'standard' | 'child'>('standard');
  const [skipNoAudio, setSkipNoAudio] = useState(true);
  const [pendingSourceAfterSwitch, setPendingSourceAfterSwitch] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [fileValidity, setFileValidity] = useState<{ [path: string]: boolean } | undefined>(
    undefined
  );
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportDialogTab, setExportDialogTab] = useState<ExportDialogTab>('options');
  const [expandedExhibits, setExpandedExhibits] = useState<Set<string>>(new Set());

  const [exportOptions, setExportOptions] = useState<TourExportOptions>({
    languages: [DEFAULT_LANGUAGE],
    includeStandard: true,
    includeChild: true,
    includeExtended: true,
    includeCovers: true,
    includeTranscripts: true,
  });

  if (!currentExhibition) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">请先在展览总览中选择一个展览</div>
      </div>
    );
  }

  const sortedRoute = useMemo(
    () => [...currentExhibition.route].sort((a, b) => a.order - b.order),
    [currentExhibition.route]
  );

  const checkAllFiles = useCallback(async () => {
    setIsCheckingFiles(true);
    const paths = collectAllAudioPaths(currentExhibition.exhibits);
    try {
      const result = await window.electronAPI.checkFilesExist(paths);
      setFileValidity(result);
    } catch (e) {
      console.error('File check failed:', e);
    }
    setIsCheckingFiles(false);
  }, [currentExhibition.exhibits]);

  useEffect(() => {
    checkAllFiles();
  }, [checkAllFiles]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    let currentTime = 0;
    return sortedRoute.map((item) => {
      const exhibit = currentExhibition.exhibits.find((e) => e.id === item.exhibitId);
      const duration = exhibit?.suggestedDuration || 120;
      const hasAudio = exhibit ? hasAudioFile(exhibit, activeLanguage, playMode, fileValidity) : false;
      let isPathBroken = false;
      if (exhibit) {
        let path: string | undefined;
        if (playMode === 'standard') {
          path = exhibit.standardAudio[activeLanguage]?.audioPath;
        } else {
          path = exhibit.childAudio?.[activeLanguage]?.audioPath;
        }
        if (path && fileValidity && fileValidity[path] === false) {
          isPathBroken = true;
        }
      }
      const timelineItem: TimelineItem = {
        id: item.id,
        exhibit: exhibit!,
        hall: item.hall,
        order: item.order,
        startTime: currentTime,
        endTime: currentTime + duration,
        hasAudio,
        isPathBroken,
      };
      currentTime += duration;
      return timelineItem;
    });
  }, [sortedRoute, currentExhibition.exhibits, activeLanguage, playMode, fileValidity]);

  const totalDuration = timelineItems.reduce((sum, item) => sum + (item.exhibit.suggestedDuration || 120), 0);
  const totalPlayable = timelineItems.filter((t) => t.hasAudio).length;
  const totalBrokenPaths = timelineItems.filter((t) => t.isPathBroken).length;

  const getAudioPathForIndex = useCallback(
    (index: number): string | undefined => {
      const item = timelineItems[index];
      if (!item || !item.exhibit) return undefined;
      const exhibit = item.exhibit;
      if (playMode === 'standard') {
        return exhibit.standardAudio[activeLanguage]?.audioPath;
      } else {
        return exhibit.childAudio?.[activeLanguage]?.audioPath;
      }
    },
    [timelineItems, playMode, activeLanguage]
  );

  // Effect: when playIndex changes -> set src
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentPlayIndex >= 0 && currentPlayIndex < timelineItems.length) {
      const src = getAudioPathForIndex(currentPlayIndex);
      if (src) {
        // check valid path
        if (fileValidity && fileValidity[src] === false) {
          // treat as no audio, auto skip after short delay
          if (isPlaying) {
            setTimeout(() => {
              playNext();
            }, 1500);
          }
          return;
        }
        const wasPending = pendingSourceAfterSwitch;
        const shouldAutoPlay = wasPending || isPlaying;
        setPendingSourceAfterSwitch(false);
        audio.src = 'file:///' + src.replace(/\\/g, '/');
        audio.load();
        if (shouldAutoPlay) {
          try {
            audio.play().catch((e) => console.log('Play rejected:', e));
          } catch (e) {
            console.warn('Play error:', e);
          }
        }
      } else {
        // no audio
        if (isPlaying) {
          setTimeout(() => playNext(), skipNoAudio ? 500 : 2000);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayIndex]);

  // Effect: when language or playMode changes -> swap source on currently playing item
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentPlayIndex < 0) return;

    const src = getAudioPathForIndex(currentPlayIndex);
    const wasPlaying = !audio.paused;
    audio.pause();
    audio.currentTime = 0;

    if (!src || (fileValidity && fileValidity[src] === false)) {
      // new version has no audio at current index -> skip forward to next playable if was playing
      if (wasPlaying) {
        setPendingSourceAfterSwitch(true);
        setTimeout(() => playNext(), 600);
      } else {
        // paused -> just locate to first valid in new version
        const playable = findPlayableFrom(currentPlayIndex, +1);
        if (playable !== -1 && playable !== currentPlayIndex) {
          setCurrentPlayIndex(playable);
        }
      }
      return;
    }

    audio.src = 'file:///' + src.replace(/\\/g, '/');
    audio.load();
    if (wasPlaying) {
      try {
        audio.play().catch(() => {});
      } catch (e) {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode, activeLanguage]);

  const findPlayableFrom = (start: number, dir: 1 | -1): number => {
    const n = timelineItems.length;
    if (n === 0) return -1;
    let i = start;
    do {
      const t = timelineItems[i];
      const src = getAudioPathForIndex(i);
      if (t && t.hasAudio && src && (!fileValidity || fileValidity[src] !== false)) {
        return i;
      }
      i = (i + dir + n) % n;
    } while (i !== start);
    return -1;
  };

  const playNext = () => {
    if (timelineItems.length === 0) return;
    const next = findPlayableFrom((currentPlayIndex + 1) % timelineItems.length, +1);
    if (next === -1 || next === currentPlayIndex) {
      // all exhausted -> stop
      handleStop();
      return;
    }
    setCurrentPlayIndex(next);
  };

  const playPrev = () => {
    if (timelineItems.length === 0) return;
    const start = currentPlayIndex <= 0 ? timelineItems.length - 1 : currentPlayIndex - 1;
    const prev = findPlayableFrom(start, -1);
    if (prev === -1) return;
    setCurrentPlayIndex(prev);
  };

  const handlePlayAll = () => {
    if (totalPlayable === 0) return;
    const first = findPlayableFrom(0, +1);
    if (first === -1) return;
    setCurrentPlayIndex(first);
    setIsPlaying(true);
  };

  const handlePause = () => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else if (audio && audio.paused) {
      // resume only if we have a valid index and src
      if (currentPlayIndex >= 0) {
        const src = getAudioPathForIndex(currentPlayIndex);
        if (src && (!fileValidity || fileValidity[src] !== false)) {
          try {
            audio.play().catch(() => {});
            setIsPlaying(true);
          } catch (e) {
            // ignore
          }
        }
      }
    }
  };

  const handlePrev = () => {
    // locate only (no auto play if currently paused)
    const wasPlaying = isPlaying;
    const audio = audioRef.current;
    if (audio && wasPlaying) audio.pause();
    setIsPlaying(false);
    const start = currentPlayIndex <= 0 ? timelineItems.length - 1 : currentPlayIndex - 1;
    const prev = findPlayableFrom(start, -1);
    if (prev === -1) return;
    setCurrentPlayIndex(prev);
  };

  const handleNext = () => {
    const wasPlaying = isPlaying;
    const audio = audioRef.current;
    if (audio && wasPlaying) audio.pause();
    setIsPlaying(false);
    if (timelineItems.length === 0) return;
    const next = findPlayableFrom((currentPlayIndex + 1) % timelineItems.length, +1);
    if (next === -1 || next === currentPlayIndex) {
      return;
    }
    setCurrentPlayIndex(next);
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentPlayIndex(-1);
  };

  const handleAudioEnded = () => {
    setIsPlaying(true);
    playNext();
  };

  const toggleExhibitExpand = (exhibitId: string) => {
    const next = new Set(expandedExhibits);
    if (next.has(exhibitId)) next.delete(exhibitId);
    else next.add(exhibitId);
    setExpandedExhibits(next);
  };

  const downloadFile = (filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportChecklist = () => {
    const csv = exportChecklist(currentExhibition, LANG_CODES, fileValidity);
    downloadFile(
      `${currentExhibition.name}-讲解清单-${new Date().toISOString().slice(0, 10)}.csv`,
      '\uFEFF' + csv,
      'text/csv'
    );
  };

  const handleExportPublishChecklist = () => {
    const txt = exportPublishChecklist(currentExhibition, LANG_CODES, fileValidity);
    downloadFile(
      `${currentExhibition.name}-发布确认清单-${new Date().toISOString().slice(0, 10)}.txt`,
      txt,
      'text/plain'
    );
  };

  const validation = useMemo(
    () => buildTourValidation(currentExhibition, LANG_CODES, fileValidity),
    [currentExhibition, fileValidity]
  );

  const currentExhibitStatuses: Map<string, ExhibitAudioStatus> = useMemo(() => {
    const m = new Map();
    currentExhibition.exhibits.forEach((exh) => {
      m.set(exh.id, getExhibitAudioStatus(exh, LANG_CODES, fileValidity));
    });
    return m;
  }, [currentExhibition.exhibits, fileValidity]);

  const missingCheck = useMemo(() => {
    let needsWork = 0;
    let hasBroken = 0;
    let complete = 0;
    sortedRoute.forEach((item) => {
      const exh = currentExhibition.exhibits.find((e) => e.id === item.exhibitId);
      if (!exh) return;
      const miss = checkMissingAudio(exh, LANG_CODES, fileValidity);
      const totalMiss =
        miss.standard.length +
        miss.child.length +
        miss.extended.reduce((s, st) => s + st.missing.length, 0);
      const totalBroken =
        miss.brokenStandard.length +
        miss.brokenChild.length +
        miss.extended.reduce((s, st) => s + st.broken.length, 0);
      if (totalBroken > 0) hasBroken++;
      else if (totalMiss > 0) needsWork++;
      else complete++;
    });
    return { complete, needsWork, hasBroken };
  }, [sortedRoute, currentExhibition.exhibits, fileValidity]);

  const previewValidation = useMemo(() => {
    return buildTourValidation(currentExhibition, exportOptions.languages, fileValidity);
  }, [currentExhibition, exportOptions.languages, fileValidity]);

  const handleExportTourPackage = () => {
    if (exportOptions.languages.length === 0) return;
    const pkg = buildTourDataPackage(currentExhibition, exportOptions, fileValidity);
    const json = JSON.stringify(pkg, null, 2);
    const filename = `${currentExhibition.name}-游客端数据包-v${pkg.version}.json`;
    downloadFile(filename, json, 'application/json');

    // record batch
    const batch: ExportBatchRecord = {
      id: generateId(),
      exportedAt: Date.now(),
      exhibitionId: currentExhibition.id,
      exhibitionName: currentExhibition.name,
      options: JSON.parse(JSON.stringify(exportOptions)),
      validation: { ...pkg.validation },
      filename,
    };
    addExportBatch(batch);
  };

  const renderBadge = (st: { hasAudio: boolean; hasText: boolean; isPathValid?: boolean }) => {
    if (st.isPathValid === false) return <span className="status-pill error">❌ 路径失效</span>;
    if (st.hasAudio) return <span className="status-pill ok">🔊 已绑定</span>;
    if (st.hasText) return <span className="status-pill warn">📝 待录音</span>;
    return <span className="status-pill miss">📭 缺失</span>;
  };

  const renderInlineBadge = (st: { hasAudio: boolean; hasText: boolean; isPathValid?: boolean }, code: string) => {
    if (st.isPathValid === false) return <span className="inline-status err" title={`${code} 路径失效`}>✖{code}</span>;
    if (st.hasAudio) return <span className="inline-status ok" title={`${code} 已绑定`}>✓{code}</span>;
    if (st.hasText) return <span className="inline-status text" title={`${code} 待录音`}>文{code}</span>;
    return <span className="inline-status miss" title={`${code} 缺失`}>✗{code}</span>;
  };

  const currentBatchHistory = useMemo(
    () => exportBatchHistory.filter((b) => b.exhibitionId === currentExhibition.id),
    [exportBatchHistory, currentExhibition.id]
  );

  return (
    <div className="preview-panel">
      <audio ref={audioRef} onEnded={handleAudioEnded} preload="metadata" />

      <div className="panel-header">
        <h2>试听与发布</h2>
        <div className="header-actions">
          <div className="language-switcher">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                className={`lang-btn ${activeLanguage === lang.code ? 'active' : ''}`}
                onClick={() => setActiveLanguage(lang.code)}
                title={lang.name}
              >
                {lang.native}
              </button>
            ))}
          </div>
          <button
            className="refresh-btn"
            onClick={checkAllFiles}
            disabled={isCheckingFiles}
            title="重新检查所有音频文件路径"
          >
            {isCheckingFiles ? '⏳ 检查中…' : '🔄 刷新文件检查'}
          </button>
        </div>
      </div>

      <div className="panel-subtitle">
        共 {currentExhibition.exhibits.length} 件展品 · {sortedRoute.length} 个路线节点 · 总时长 {formatDuration(totalDuration)}
      </div>

      <div className="tabs">
        <button
          className={`tab ${viewMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          🎬 时间轴试听
        </button>
        <button
          className={`tab ${viewMode === 'check' ? 'active' : ''}`}
          onClick={() => setViewMode('check')}
        >
          ✅ 音频检查 {missingCheck.needsWork + missingCheck.hasBroken > 0 ? `${missingCheck.needsWork + missingCheck.hasBroken} 项缺失` : ''}
        </button>
        <button
          className={`tab ${viewMode === 'publish' ? 'active' : ''}`}
          onClick={() => setViewMode('publish')}
        >
          📦 发布清单
        </button>
        <button
          className={`tab ${viewMode === 'preview' ? 'active' : ''}`}
          onClick={() => setViewMode('preview')}
        >
          📱 游客端预览
        </button>
      </div>

      {viewMode === 'timeline' && (
        <div className="timeline-view">
          <div className="player-toolbar">
            <div className="mode-switch">
              <label>播放版本:</label>
              <button
                className={`mode-btn ${playMode === 'standard' ? 'active' : ''}`}
                onClick={() => setPlayMode('standard')}
              >
                👥 标准版
              </button>
              <button
                className={`mode-btn ${playMode === 'child' ? 'active' : ''}`}
                onClick={() => setPlayMode('child')}
                disabled={!currentExhibition.exhibits.some((e) => e.childAudio)}
              >
                👶 儿童版
              </button>
            </div>
            <div className="player-stat-pills">
              <span className="stat-pill">🎧 可播放 {totalPlayable}/{sortedRoute.length}</span>
              {totalBrokenPaths > 0 && <span className="stat-pill danger">⚠️ 路径失效 {totalBrokenPaths}</span>}
            </div>
            <label className="skip-toggle">
              <input
                type="checkbox"
                checked={skipNoAudio}
                onChange={(e) => setSkipNoAudio(e.target.checked)}
              />
              跳过无音频展品
            </label>
            <div className="player-controls-group">
              <button
                className="control-btn prev"
                onClick={handlePrev}
                disabled={timelineItems.length === 0}
                title="上一件（仅定位）"
              >
                ⏮ 上一件
              </button>
              {!isPlaying ? (
                <button
                  className="control-btn play primary"
                  onClick={currentPlayIndex >= 0 ? handlePause : handlePlayAll}
                  disabled={totalPlayable === 0}
                  title="播放全部 / 继续"
                >
                  ▶️ {currentPlayIndex >= 0 ? '继续' : '播放全部'}
                </button>
              ) : (
                <button
                  className="control-btn pause primary"
                  onClick={handlePause}
                  title="暂停"
                >
                  ⏸ 暂停
                </button>
              )}
              <button
                className="control-btn next"
                onClick={handleNext}
                disabled={timelineItems.length === 0}
                title="下一件（仅定位）"
              >
                ⏭ 下一件
              </button>
              <button
                className="control-btn stop warn"
                onClick={handleStop}
                disabled={timelineItems.length === 0}
                title="停止"
              >
                ⏹ 停止
              </button>
            </div>
          </div>

          <div className="timeline-progress">
            {timelineItems.map((item, idx) => {
              const width =
                totalDuration > 0 ? ((item.endTime - item.startTime) / totalDuration) * 100 : 0;
              let cls = 'timeline-segment';
              if (idx === currentPlayIndex) cls += ' active';
              if (!item.hasAudio) cls += ' no-audio';
              if (item.isPathBroken) cls += ' path-broken';
              return (
                <div
                  key={item.id}
                  className={cls}
                  style={{ width: `${width}%` }}
                  title={`${item.exhibit?.title || ''} · ${formatDuration(item.endTime - item.startTime)}`}
                  onClick={() => {
                    if (!item.hasAudio || item.isPathBroken) return;
                    setCurrentPlayIndex(idx);
                    setIsPlaying(true);
                  }}
                >
                  <div className="segment-label">
                    {item.isPathBroken
                      ? '✖'
                      : item.hasAudio
                      ? '♪'
                      : '—'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="timeline-list">
            {timelineItems.map((item, idx) => {
              const status = currentExhibitStatuses.get(item.exhibit?.id);
              const st = status?.standard[activeLanguage];
              const chSt = playMode === 'child' ? status?.child?.[activeLanguage] : undefined;
              const activeStatus = playMode === 'child' ? chSt : st;
              let itemCls = 'timeline-list-item';
              if (idx === currentPlayIndex) itemCls += ' playing';
              if (item.isPathBroken) itemCls += ' path-broken';
              return (
                <div
                  key={item.id}
                  className={itemCls}
                  onClick={() => {
                    if (item.hasAudio && !item.isPathBroken) {
                      setCurrentPlayIndex(idx);
                      setIsPlaying(true);
                    }
                  }}
                >
                  <div className="item-index">{idx + 1}</div>
                  <div className="item-hall-tag">{item.hall}</div>
                  <div className="item-title">
                    {item.exhibit?.title}
                    {item.exhibit?.isHighlight && <span className="highlight-star">⭐</span>}
                  </div>
                  <div className="item-duration">
                    {formatDuration(item.exhibit?.suggestedDuration || 0)}
                  </div>
                  <div className="item-status">
                    {item.isPathBroken ? (
                      <span className="badge-error">❌ 路径失效</span>
                    ) : item.hasAudio ? (
                      <span className="badge-ok">🔊 已绑定</span>
                    ) : activeStatus?.hasText ? (
                      <span className="badge-warn">📝 待录音</span>
                    ) : (
                      <span className="badge-miss">📭 缺失</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'check' && (
        <div className="check-view">
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-value">{sortedRoute.length}</div>
              <div className="summary-label">展品总数</div>
            </div>
            <div className="summary-card success">
              <div className="summary-value">{missingCheck.complete}</div>
              <div className="summary-label">音频完整</div>
            </div>
            <div className="summary-card warning">
              <div className="summary-value">{missingCheck.needsWork}</div>
              <div className="summary-label">需要完善</div>
            </div>
            <div className="summary-card danger">
              <div className="summary-value">{missingCheck.hasBroken}</div>
              <div className="summary-label">❌ 路径失效</div>
            </div>
          </div>

          <div className="legend-row">
            <span>图例：</span>
            <span className="legend-dot ok"></span> 音频完整
            <span className="legend-dot warn"></span> 有文本待录音
            <span className="legend-dot miss"></span> 未填写
            <span className="legend-dot error"></span> 路径失效
          </div>

          <div className="check-list">
            {sortedRoute.map((routeItem, idx) => {
              const exh = currentExhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
              if (!exh) return null;
              const status = getExhibitAudioStatus(exh, LANG_CODES, fileValidity);
              const miss = checkMissingAudio(exh, LANG_CODES, fileValidity);
              const hasBroken =
                miss.brokenStandard.length +
                  miss.brokenChild.length +
                  miss.extended.reduce((s, st) => s + st.broken.length, 0) >
                0;
              const isExpanded = expandedExhibits.has(exh.id);
              return (
                <div
                  key={routeItem.id}
                  className={`check-item ${hasBroken ? 'has-broken' : ''}`}
                  onClick={() => toggleExhibitExpand(exh.id)}
                >
                  <div className="check-item-header">
                    <span className="check-order">{idx + 1}</span>
                    <span className="check-hall">{routeItem.hall}</span>
                    <span className="check-title">
                      {exh.code} - {exh.title}
                      {exh.isHighlight && <span className="highlight-star">⭐</span>}
                    </span>
                    <span className="check-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                    <div className="check-lang-row">
                      {LANG_CODES.map((code) => {
                        const s = status.standard[code];
                        if (s.isPathValid === false)
                          return (
                            <span
                              key={code}
                              className="lang-dot error"
                              title={`${code} 标准版路径失效`}
                            ></span>
                          );
                        if (s.hasAudio)
                          return <span key={code} className="lang-dot ok" title={`${code} 完整`}></span>;
                        if (s.hasText)
                          return (
                            <span
                              key={code}
                              className="lang-dot warn"
                              title={`${code} 有文本待录音`}
                            ></span>
                          );
                        return (
                          <span key={code} className="lang-dot miss" title={`${code} 未填写`}></span>
                        );
                      })}
                    </div>
                    <div className="check-summary">
                      {hasBroken && (
                        <span className="badge-error">
                          ❌ 失效 {miss.brokenStandard.length + miss.brokenChild.length}
                          {miss.extended.reduce((s, st) => s + st.broken.length, 0) > 0 &&
                            `+${miss.extended.reduce((s, st) => s + st.broken.length, 0)}(延伸)`}
                        </span>
                      )}
                      {status.child && miss.child.length > 0 && (
                        <span className="badge-warn">儿童版缺 {miss.child.length} 种语言</span>
                      )}
                      {!exh.coverImage && <span className="badge-warn">⚠️ 缺封面</span>}
                      {status.extended.length > 0 && (
                        <span className="badge-info">📖 延伸故事 {status.extended.length} 个</span>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="check-expand-body">
                      <div className="expand-section-title">标准讲解（{LANG_CODES.length} 种语言）</div>
                      <div className="detail-lang-grid">
                        {LANG_CODES.map((code) => (
                          <div key={'s-' + code} className="detail-lang-col">
                            <div className="lang-code-head">{code}</div>
                            {renderBadge(status.standard[code])}
                          </div>
                        ))}
                      </div>
                      {status.child && (
                        <>
                          <div className="expand-section-title">儿童版讲解</div>
                          <div className="detail-lang-grid">
                            {LANG_CODES.map((code) => (
                              <div key={'c-' + code} className="detail-lang-col">
                                <div className="lang-code-head">{code}</div>
                                {renderBadge(status.child[code])}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {status.extended.length > 0 && (
                        <>
                          <div className="expand-section-title">延伸故事</div>
                          {status.extended.map((story, si) => (
                            <div key={si} className="extended-story-detail">
                              <div className="story-title-line">📖 {story.title}</div>
                              <div className="detail-lang-grid">
                                {LANG_CODES.map((code) => (
                                  <div key={'e' + si + code} className="detail-lang-col">
                                    <div className="lang-code-head">{code}</div>
                                    {renderBadge(story.audio[code])}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'publish' && (
        <div className="publish-view">
          <div className="publish-header">
            <h3>发布清单确认</h3>
            <p>确认以下信息无误后，可导出游客端数据包或发布清单（点击展品行展开各语言详情）</p>
          </div>

          <div className="publish-stats">
            <div className="publish-stat">
              <span className="stat-label">完整度评分</span>
              <span className={`stat-value score ${validation.score >= 80 ? 'ok' : validation.score >= 50 ? 'warn' : 'bad'}`}>
                {validation.score}/100
              </span>
              <div className="completion-bar">
                <div
                  className="completion-fill"
                  style={{
                    width: `${Math.max(0, validation.score - validation.brokenAudioPaths * 2)}%`,
                  }}
                ></div>
                {validation.brokenAudioPaths > 0 && (
                  <div
                    className="completion-fill error"
                    style={{
                      width: `${Math.min(100 - validation.score + validation.brokenAudioPaths * 2, validation.brokenAudioPaths * 2)}%`,
                    }}
                  ></div>
                )}
              </div>
            </div>
            <div className="publish-stat">
              <span className="stat-label">路线展品</span>
              <span className="stat-value">{validation.totalNodes} 件</span>
            </div>
            <div className="publish-stat">
              <span className="stat-label">有封面</span>
              <span className="stat-value">
                {validation.exhibitsWithCover} 件
                {validation.coversMissing > 0 && (
                  <span className="warn-inline"> ({validation.coversMissing} 件缺失)</span>
                )}
              </span>
            </div>
            {validation.brokenAudioPaths > 0 ? (
              <div className="publish-stat full-width error-bg">
                <span className="stat-label">⚠️ 失效音频路径</span>
                <span className="stat-value danger">
                  {validation.brokenAudioPaths} 个 · 标准 {validation.standardAudioBroken} / 儿童 {validation.childAudioBroken} / 延伸 {validation.extendedAudioBroken}
                </span>
              </div>
            ) : null}
          </div>

          <div className="publish-section-title">参观路线（按顺序，点击行展开语言详情）</div>
          <div className="route-table">
            <div className="route-table-head">
              <div style={{ width: 40 }}>#</div>
              <div style={{ width: 80 }}>展厅</div>
              <div style={{ flex: 1.6 }}>展品名称</div>
              <div style={{ flex: 3, minWidth: 300 }}>状态（8种语言 × 标准/儿童 + 延伸）</div>
              <div style={{ width: 120 }}>封面</div>
              <div style={{ width: 90 }}>完整度</div>
            </div>
            {sortedRoute.map((routeItem, idx) => {
              const exh = currentExhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
              if (!exh) return null;
              const status = getExhibitAudioStatus(exh, LANG_CODES, fileValidity);
              const isExpanded = expandedExhibits.has(exh.id);
              const miss = checkMissingAudio(exh, LANG_CODES, fileValidity);
              const totalIssues =
                miss.standard.length +
                miss.child.length +
                miss.extended.reduce((s, st) => s + st.missing.length, 0);
              const brokenCount =
                miss.brokenStandard.length +
                miss.brokenChild.length +
                miss.extended.reduce((s, st) => s + st.broken.length, 0);
              const maxIssues = LANG_CODES.length * 2 + miss.extended.length * LANG_CODES.length;
              const pct = maxIssues === 0 ? 100 : Math.round((1 - totalIssues / maxIssues) * 100);
              return (
                <div key={routeItem.id}>
                  <div
                    className="route-table-row"
                    onClick={() => toggleExhibitExpand(exh.id)}
                  >
                    <div>{idx + 1}</div>
                    <div>{routeItem.hall}</div>
                    <div className="row-title">
                      {exh.code} · {exh.title}
                      {exh.isHighlight && <span className="highlight-star">⭐</span>}
                      <span className="expand-arrow">{isExpanded ? '▾' : '▸'}</span>
                    </div>
                    <div className="status-cells">
                      <div className="inline-status-row" title="标准讲解 8 种语言">
                        {LANG_CODES.map((code) => renderInlineBadge(status.standard[code], code))}
                      </div>
                      {status.child && (
                        <div className="inline-status-row child-row" title="儿童版 8 种语言">
                          <span className="row-tag">👶</span>
                          {LANG_CODES.map((code) => renderInlineBadge(status.child[code], code))}
                        </div>
                      )}
                      {status.extended.length > 0 && (
                        <div className="inline-status-row ext-row">
                          <span className="row-tag">📖×{status.extended.length}</span>
                          {status.extended.slice(0, 2).map((st, si) => (
                            <div key={si} className="mini-ext">
                              {LANG_CODES.slice(0, 4).map((code) =>
                                renderInlineBadge(st.audio[code], code)
                              )}
                              {LANG_CODES.length > 4 && (
                                <span className="inline-status more" title="更多语言">+{LANG_CODES.length - 4}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>{exh.coverImage ? <span className="badge-ok">✓ 有</span> : <span className="badge-miss">✗ 无</span>}</div>
                    <div>
                      <div className="completion-bar small">
                        <div
                          className="completion-fill"
                          style={{ width: `${Math.max(0, pct - brokenCount * 3)}%` }}
                        ></div>
                        {brokenCount > 0 && (
                          <div
                            className="completion-fill error"
                            style={{ width: `${Math.min(brokenCount * 3, 100 - pct + brokenCount * 3)}%` }}
                          ></div>
                        )}
                      </div>
                      <div className="pct-text">
                        {pct}%
                        {brokenCount > 0 && <span className="broken-note"> · 失效{brokenCount}</span>}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="route-table-expand">
                      <div className="expand-row">
                        <div className="expand-label">标准讲解（{LANG_CODES.length} 种）</div>
                        <div className="detail-lang-grid">
                          {LANG_CODES.map((code) => (
                            <div key={'ps' + code} className="detail-lang-col">
                              <div className="lang-code-head">{code}</div>
                              {renderBadge(status.standard[code])}
                            </div>
                          ))}
                        </div>
                      </div>
                      {status.child && (
                        <div className="expand-row">
                          <div className="expand-label">儿童版讲解</div>
                          <div className="detail-lang-grid">
                            {LANG_CODES.map((code) => (
                              <div key={'pc' + code} className="detail-lang-col">
                                <div className="lang-code-head">{code}</div>
                                {renderBadge(status.child[code])}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {status.extended.length > 0 && (
                        <div className="expand-row">
                          <div className="expand-label">延伸故事（按语言逐项展开）</div>
                          <div className="extended-table">
                            {status.extended.map((story, si) => (
                              <div key={si} className="extended-table-row">
                                <div className="story-title-cell">📖 故事{si + 1}：{story.title}</div>
                                <div className="detail-lang-grid">
                                  {LANG_CODES.map((code) => (
                                    <div key={'pe' + si + code} className="detail-lang-col">
                                      <div className="lang-code-head">{code}</div>
                                      {renderBadge(story.audio[code])}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="publish-section-title">各语言音频完成度</div>
          <div className="lang-completion-grid">
            {LANG_CODES.map((code) => {
              const sTotal = sortedRoute.length;
              const sOk = sortedRoute.filter((r) => {
                const e = currentExhibition.exhibits.find((x) => x.id === r.exhibitId);
                if (!e) return false;
                const st = getExhibitAudioStatus(e, [code], fileValidity);
                return st.standard[code].hasAudio && st.standard[code].isPathValid !== false;
              }).length;
              const sBroken = sortedRoute.filter((r) => {
                const e = currentExhibition.exhibits.find((x) => x.id === r.exhibitId);
                if (!e) return false;
                const st = getExhibitAudioStatus(e, [code], fileValidity);
                return st.standard[code].isPathValid === false;
              }).length;
              const pct = sTotal === 0 ? 100 : Math.round((sOk / sTotal) * 100);
              return (
                <div key={code} className="lang-completion-item">
                  <div className="lang-head-line">
                    <span className="lang-name">{code}</span>
                    <span className="lang-count">
                      {sOk}/{sTotal}
                      {sBroken > 0 && <span className="lang-broken"> · ⚠{sBroken}失效</span>}
                    </span>
                  </div>
                  <div className="completion-bar">
                    <div className="completion-fill" style={{ width: `${pct}%` }}></div>
                    {sBroken > 0 && (
                      <div
                        className="completion-fill error"
                        style={{
                          width: `${Math.min(sBroken * 3, 100 - pct)}%`,
                          left: `${pct}%`,
                        }}
                      ></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="publish-actions">
            <button className="btn-primary" onClick={() => { setShowExportDialog(true); setExportDialogTab('options'); }}>
              📱 导出游客端数据包
            </button>
            <button className="btn-secondary" onClick={handleExportPublishChecklist}>
              📋 导出确认清单
            </button>
            <button className="btn-secondary" onClick={handleExportChecklist}>
              📝 导出讲解清单(CSV)
            </button>
            <button className="btn-ghost" onClick={() => setCurrentWindow('edit')}>
              ↩ 返回展品编辑
            </button>
          </div>
        </div>
      )}

      {viewMode === 'preview' && (
        <div className="tour-preview-view">
          <div className="publish-header">
            <h3>游客端展示顺序预览</h3>
            <p>按照参观路线模拟游客实际游览顺序（{activeLanguage}）</p>
          </div>
          <div className="tour-list">
            {sortedRoute.map((routeItem, idx) => {
              const exh = currentExhibition.exhibits.find((e) => e.id === routeItem.exhibitId);
              if (!exh) return null;
              const status = getExhibitAudioStatus(exh, [activeLanguage], fileValidity);
              const st = status.standard[activeLanguage];
              return (
                <div
                  key={routeItem.id}
                  className="tour-card"
                  onClick={() => {
                    setCurrentExhibit(exh.id);
                    setCurrentWindow('edit');
                  }}
                >
                  <div className="tour-card-number">{idx + 1}</div>
                  <div className="tour-card-hall">{routeItem.hall}</div>
                  <div className="tour-card-body">
                    <div className="tour-card-title">
                      {exh.code} · {exh.title}
                      {exh.isHighlight && <span className="highlight-star">⭐</span>}
                    </div>
                    <div className="tour-card-meta">
                      ⏱ {formatDuration(exh.suggestedDuration)}
                      {st.isPathValid === false && <span className="badge-error">❌ 路径失效</span>}
                      {st.hasAudio && st.isPathValid !== false && <span className="badge-ok">🔊 音频可用</span>}
                      {status.child && (
                        <span className="badge-info">
                          👶 儿童版 {status.child[activeLanguage].hasAudio ? '✓' : '✗'}
                        </span>
                      )}
                      {status.extended.length > 0 && (
                        <span className="badge-info">📖 {status.extended.length} 个延伸故事</span>
                      )}
                    </div>
                  </div>
                  {exh.coverImage && (
                    <div className="tour-card-cover">
                      <img src={'file:///' + exh.coverImage.replace(/\\/g, '/')} alt="" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showExportDialog && (
        <div className="modal-overlay" onClick={() => setShowExportDialog(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">📱 导出游客端数据包</div>
              <button className="close-btn" onClick={() => setShowExportDialog(false)}>✕</button>
            </div>
            <div className="modal-tabs">
              <button className={`modal-tab ${exportDialogTab === 'options' ? 'active' : ''}`} onClick={() => setExportDialogTab('options')}>
                导出配置
              </button>
              <button className={`modal-tab ${exportDialogTab === 'history' ? 'active' : ''}`} onClick={() => setExportDialogTab('history')}>
                批次历史 ({currentBatchHistory.length})
              </button>
            </div>
            <div className="modal-body">
              {exportDialogTab === 'options' && (
                <>
                  <div className="modal-section-title">选择导出语言（至少 1 项）</div>
                  <div className="lang-checkbox-grid">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const checked = exportOptions.languages.includes(lang.code);
                      return (
                        <label
                          key={lang.code}
                          className={`lang-checkbox ${checked ? 'checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExportOptions({
                                  ...exportOptions,
                                  languages: [...exportOptions.languages, lang.code],
                                });
                              } else if (exportOptions.languages.length > 1) {
                                setExportOptions({
                                  ...exportOptions,
                                  languages: exportOptions.languages.filter(
                                    (x) => x !== lang.code
                                  ),
                                });
                              }
                            }}
                          />
                          <span className="cb-native">{lang.native}</span>
                          <span className="cb-code">{lang.code}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="modal-section-title">选择导出内容</div>
                  <div className="content-checkbox-list">
                    <label>
                      <input
                        type="checkbox"
                        checked={exportOptions.includeStandard}
                        disabled
                      />
                      标准讲解（必须有）
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={exportOptions.includeChild}
                        onChange={(e) => setExportOptions({ ...exportOptions, includeChild: e.target.checked })}
                      />
                      儿童版讲解
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={exportOptions.includeExtended}
                        onChange={(e) => setExportOptions({ ...exportOptions, includeExtended: e.target.checked })}
                      />
                      延伸故事
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={exportOptions.includeCovers}
                        onChange={(e) => setExportOptions({ ...exportOptions, includeCovers: e.target.checked })}
                      />
                      封面图片路径
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={exportOptions.includeTranscripts}
                        onChange={(e) => setExportOptions({ ...exportOptions, includeTranscripts: e.target.checked })}
                      />
                      讲解词文本（字幕用）
                    </label>
                  </div>
                  <div className="modal-section-title">数据包校验摘要预览</div>
                  <div className="validation-preview">
                    <div className="vp-row">
                      <div className="vp-label">导出语言数</div>
                      <div className="vp-value">{exportOptions.languages.length} 种</div>
                    </div>
                    <div className="vp-row">
                      <div className="vp-label">展品数</div>
                      <div className="vp-value">{previewValidation.totalNodes} 件</div>
                    </div>
                    <div className="vp-row">
                      <div className="vp-label">预计缺音频</div>
                      <div className="vp-value warn">
                        {Object.values(previewValidation.standardAudioMissing).reduce((s, v) => s + v, 0)}
                        {previewValidation.childAudioMissing &&
                          ` +${Object.values(previewValidation.childAudioMissing).reduce((s, v) => s + v, 0)}(儿童)`}
                        {previewValidation.extendedAudioMissing > 0 &&
                          ` +${previewValidation.extendedAudioMissing}(延伸)`}
                      </div>
                    </div>
                    <div className="vp-row">
                      <div className="vp-label">完整度评分</div>
                      <div
                        className={`vp-value ${previewValidation.score >= 80 ? 'ok' : previewValidation.score >= 50 ? 'warn' : 'bad'}`}
                      >
                        {previewValidation.score}/100
                      </div>
                    </div>
                    {previewValidation.brokenAudioPaths > 0 && (
                      <div className="vp-row danger">
                        <div className="vp-label">⚠️ 失效路径</div>
                        <div className="vp-value bad">
                          {previewValidation.brokenAudioPaths} 个（标准 {previewValidation.standardAudioBroken} / 儿童 {previewValidation.childAudioBroken} / 延伸 {previewValidation.extendedAudioBroken}）
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {exportDialogTab === 'history' && (
                <>
                  {currentBatchHistory.length === 0 ? (
                    <div className="empty-history">
                      <div className="eh-icon">🗂️</div>
                      <div className="eh-text">暂无历史记录，第一次导出后会自动记录批次信息</div>
                    </div>
                  ) : (
                    <>
                      <div className="history-header-bar">
                        <span>共 {currentBatchHistory.length} 条记录（仅保留最近 50 条）</span>
                        <button className="btn-small-ghost" onClick={clearExportBatchHistory}>清空记录</button>
                      </div>
                      <div className="history-list">
                        {currentBatchHistory.map((b) => (
                          <div key={b.id} className="history-item">
                            <div className="hi-top">
                              <span className="hi-filename">{b.filename || '游客端数据包.json'}</span>
                              <span className="hi-time">{new Date(b.exportedAt).toLocaleString('zh-CN')}</span>
                            </div>
                            <div className="hi-meta">
                              语言：{b.options.languages.join('、')} · 版本：标准{b.options.includeStandard ? '✓' : '✗'} 儿童{b.options.includeChild ? '✓' : '✗'} 延伸{b.options.includeExtended ? '✓' : '✗'}
                            </div>
                            <div className="hi-validation">
                              <span>完整度 <b className={b.validation.score >= 80 ? 'ok' : 'warn'}>{b.validation.score}</b>/100</span>
                              <span>节点 {b.validation.totalNodes}</span>
                              <span>缺封面 {b.validation.coversMissing}</span>
                              {b.validation.brokenAudioPaths > 0 && (
                                <span className="bad">⚠️失效 {b.validation.brokenAudioPaths}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setShowExportDialog(false)}>取消</button>
              {exportDialogTab === 'options' && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    handleExportTourPackage();
                    setExportDialogTab('history');
                  }}
                  disabled={exportOptions.languages.length === 0}
                >
                  📥 导出 JSON 并记录批次
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PreviewPanel;
