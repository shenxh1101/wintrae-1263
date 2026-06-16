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

const LANG_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

function PreviewPanel() {
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const setCurrentWindow = useAppStore((state) => state.setCurrentWindow);
  const setCurrentExhibit = useAppStore((state) => state.setCurrentExhibit);

  const [activeLanguage, setActiveLanguage] = useState(DEFAULT_LANGUAGE);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [currentPlayIndex, setCurrentPlayIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<'standard' | 'child'>('standard');
  const [skipNoAudio, setSkipNoAudio] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [fileValidity, setFileValidity] = useState<{ [path: string]: boolean } | undefined>(
    undefined
  );
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
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

  const totalDuration =
    timelineItems.length > 0 ? timelineItems[timelineItems.length - 1].endTime : 0;

  const audioItemsCount = timelineItems.filter((item) => item.hasAudio).length;

  const missingAudioReport = useMemo(() => {
    return currentExhibition.exhibits.map((exhibit) => ({
      exhibit,
      missing: checkMissingAudio(exhibit, LANG_CODES, fileValidity),
      status: getExhibitAudioStatus(exhibit, LANG_CODES, fileValidity),
    }));
  }, [currentExhibition.exhibits, fileValidity]);

  const missingCount = missingAudioReport.filter(
    (r) =>
      r.missing.standard.length > 0 ||
      r.missing.child.length > 0 ||
      r.missing.extended.some((e) => e.missing.length > 0)
  ).length;

  const brokenCount = missingAudioReport.filter(
    (r) => r.missing.brokenStandard.length > 0 || r.missing.brokenChild.length > 0
  ).length;

  const findNextPlayableIndex = (fromIndex: number): number => {
    for (let i = fromIndex; i < timelineItems.length; i++) {
      if (timelineItems[i].hasAudio) {
        return i;
      }
    }
    return -1;
  };

  const findPrevPlayableIndex = (fromIndex: number): number => {
    for (let i = fromIndex; i >= 0; i--) {
      if (timelineItems[i].hasAudio) {
        return i;
      }
    }
    return -1;
  };

  const getAudioPathForItem = (item: TimelineItem): string | undefined => {
    if (playMode === 'standard') {
      return item.exhibit.standardAudio[activeLanguage]?.audioPath;
    }
    return item.exhibit.childAudio?.[activeLanguage]?.audioPath;
  };

  useEffect(() => {
    if (!isPlaying || currentPlayIndex < 0) return;

    const item = timelineItems[currentPlayIndex];
    if (!item) {
      setIsPlaying(false);
      setCurrentPlayIndex(-1);
      return;
    }

    if (!item.hasAudio && skipNoAudio) {
      const nextIndex = findNextPlayableIndex(currentPlayIndex + 1);
      if (nextIndex >= 0) {
        setCurrentPlayIndex(nextIndex);
      } else {
        setIsPlaying(false);
        setCurrentPlayIndex(-1);
      }
      return;
    }

    const audioPath = getAudioPathForItem(item);
    if (audioRef.current && audioPath) {
      audioRef.current.src = `file:///${audioPath}`;
      audioRef.current.play().catch(() => {
        setTimeout(() => advanceToNext(), 1500);
      });
    } else if (!audioPath) {
      const duration = item.exhibit.suggestedDuration * 1000;
      const timer = setTimeout(() => advanceToNext(), duration);
      return () => clearTimeout(timer);
    }

    return () => {};
  }, [isPlaying, currentPlayIndex]);

  const advanceToNext = () => {
    const nextIndex = skipNoAudio
      ? findNextPlayableIndex(currentPlayIndex + 1)
      : currentPlayIndex + 1;
    if (nextIndex >= 0 && nextIndex < timelineItems.length) {
      setCurrentPlayIndex(nextIndex);
    } else {
      setIsPlaying(false);
      setCurrentPlayIndex(-1);
    }
  };

  const handleAudioEnded = () => {
    advanceToNext();
  };

  const handlePlay = () => {
    if (timelineItems.length === 0) return;
    if (currentPlayIndex >= 0) {
      if (audioRef.current && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
      return;
    }
    const startIndex = skipNoAudio ? findNextPlayableIndex(0) : 0;
    if (startIndex < 0) {
      alert('当前模式下没有可播放的音频展品');
      return;
    }
    setCurrentPlayIndex(startIndex);
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentPlayIndex(-1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  const handlePrev = () => {
    if (currentPlayIndex < 0) return;
    const prevIndex = skipNoAudio
      ? findPrevPlayableIndex(currentPlayIndex - 1)
      : currentPlayIndex - 1;
    if (prevIndex >= 0) {
      setCurrentPlayIndex(prevIndex);
      if (!isPlaying) setIsPlaying(true);
    }
  };

  const handleNext = () => {
    if (currentPlayIndex < 0) return;
    const nextIndex = skipNoAudio
      ? findNextPlayableIndex(currentPlayIndex + 1)
      : currentPlayIndex + 1;
    if (nextIndex >= 0 && nextIndex < timelineItems.length) {
      setCurrentPlayIndex(nextIndex);
      if (!isPlaying) setIsPlaying(true);
    } else {
      handleStop();
    }
  };

  const handlePlayModeChange = (mode: 'standard' | 'child') => {
    if (playMode === mode) return;
    setPlayMode(mode);
    if (currentPlayIndex >= 0) {
      const item = timelineItems[currentPlayIndex];
      const stillPlayable = item
        ? hasAudioFile(item.exhibit, activeLanguage, mode, fileValidity)
        : false;
      if (!stillPlayable) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }
        if (isPlaying && skipNoAudio) {
          const next = findNextPlayableIndex(currentPlayIndex);
          if (next >= 0) {
            setCurrentPlayIndex(next);
          } else {
            setIsPlaying(false);
            setCurrentPlayIndex(-1);
          }
        }
      }
    }
  };

  const handleExportCSV = async () => {
    const csv = exportChecklist(currentExhibition, LANG_CODES, fileValidity);
    const BOM = '\uFEFF';
    const filename = `${currentExhibition.name}_讲解清单.csv`;
    await window.electronAPI.saveFile(BOM + csv, filename);
  };

  const handleExportJSON = async () => {
    const data = JSON.stringify(currentExhibition, null, 2);
    const filename = `${currentExhibition.name}_展览数据.json`;
    await window.electronAPI.saveFile(data, filename);
  };

  const handleExportTourData = async () => {
    const tourPackage = buildTourDataPackage(currentExhibition, exportOptions, fileValidity);
    const data = JSON.stringify(tourPackage, null, 2);
    const filename = `${currentExhibition.name}_游客端数据包.json`;
    await window.electronAPI.saveFile(data, filename);
    setShowExportDialog(false);
  };

  const handleExportPublishChecklist = async () => {
    const content = exportPublishChecklist(currentExhibition, LANG_CODES, fileValidity);
    const filename = `${currentExhibition.name}_发布确认清单.txt`;
    await window.electronAPI.saveFile(content, filename);
  };

  const currentItem = currentPlayIndex >= 0 ? timelineItems[currentPlayIndex] : null;

  const audioStatusForItem = (exhibit: Exhibit): ExhibitAudioStatus => {
    return getExhibitAudioStatus(exhibit, LANG_CODES, fileValidity);
  };

  const toggleExhibitExpand = (id: string) => {
    const next = new Set(expandedExhibits);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedExhibits(next);
  };

  const toggleExportLanguage = (code: string) => {
    const langs = exportOptions.languages.includes(code)
      ? exportOptions.languages.filter((l) => l !== code)
      : [...exportOptions.languages, code];
    if (langs.length === 0) return;
    setExportOptions({ ...exportOptions, languages: langs });
  };

  const renderLangBadge = (status: { hasAudio: boolean; hasText: boolean; isPathValid?: boolean }) => {
    if (status.isPathValid === false) {
      return <span className="status-pill error">❌ 路径失效</span>;
    }
    if (status.hasAudio) return <span className="status-pill success">🔊</span>;
    if (status.hasText) return <span className="status-pill warning">📝</span>;
    return <span className="status-pill danger">—</span>;
  };

  const validation = useMemo(
    () => buildTourValidation(currentExhibition, LANG_CODES, fileValidity),
    [currentExhibition, fileValidity]
  );

  return (
    <div className="preview-panel">
      <audio ref={audioRef} onEnded={handleAudioEnded} />
      <div className="preview-header">
        <div>
          <h2>试听与发布</h2>
          <p className="text-muted">
            共 {currentExhibition.exhibits.length} 件展品 · {timelineItems.length} 个路线节点 ·
            总时长 {formatDuration(totalDuration)}
            {brokenCount > 0 && (
              <span className="badge badge-error" style={{ marginLeft: 8 }}>
                ⚠ {brokenCount} 件路径异常
              </span>
            )}
          </p>
        </div>
        <div className="export-buttons">
          <div className="export-dropdown">
            <button className="btn btn-primary btn-sm">📤 导出</button>
            <div className="export-menu">
              <button onClick={handleExportCSV}>📊 讲解清单（CSV·多语言）</button>
              <button onClick={handleExportPublishChecklist}>📋 发布确认清单</button>
              <button onClick={() => setShowExportDialog(true)}>📱 游客端数据包…</button>
              <button onClick={handleExportJSON}>💾 完整 JSON 数据</button>
            </div>
          </div>
        </div>
      </div>

      <div className="preview-toolbar">
        <div className="language-switcher" style={{ background: 'none', padding: 0, border: 'none' }}>
          <span className="text-muted">讲解语言：</span>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-btn ${activeLanguage === lang.code ? 'active' : ''}`}
              onClick={() => setActiveLanguage(lang.code)}
            >
              {lang.name}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={checkAllFiles}
          disabled={isCheckingFiles}
        >
          {isCheckingFiles ? '🔄 检查中…' : '🔄 刷新文件检查'}
        </button>
      </div>

      <div className="tab-bar">
        <button
          className={`tab-item ${viewMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          🎬 时间轴试听
        </button>
        <button
          className={`tab-item ${viewMode === 'check' ? 'active' : ''}`}
          onClick={() => setViewMode('check')}
        >
          ✅ 音频检查
          {(missingCount > 0 || brokenCount > 0) && (
            <span className="badge badge-danger" style={{ marginLeft: 8 }}>
              {missingCount} 项缺失
              {brokenCount > 0 && ` ${brokenCount}异常`}
            </span>
          )}
        </button>
        <button
          className={`tab-item ${viewMode === 'publish' ? 'active' : ''}`}
          onClick={() => setViewMode('publish')}
        >
          📦 发布清单
        </button>
        <button
          className={`tab-item ${viewMode === 'preview' ? 'active' : ''}`}
          onClick={() => setViewMode('preview')}
        >
          📱 游客端预览
        </button>
      </div>

      <div className="preview-content">
        {viewMode === 'timeline' && (
          <div className="timeline-view">
            <div className="playback-controls">
              <div className="playback-info">
                {currentItem ? (
                  <>
                    <span className="now-playing">正在播放：</span>
                    <span className="now-playing-title">
                      {currentItem.order + 1}. {currentItem.exhibit.title || '未命名展品'}
                    </span>
                    <span className="badge badge-primary" style={{ marginLeft: 8 }}>
                      {currentItem.hall}
                    </span>
                    {currentItem.isPathBroken && (
                      <span className="badge badge-error" style={{ marginLeft: 8 }}>
                        ❌ 路径失效
                      </span>
                    )}
                    {!currentItem.hasAudio && !currentItem.isPathBroken && (
                      <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                        ⚠ 无音频
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">点击播放按钮开始试听整条路线</span>
                )}
              </div>
              <div className="playback-buttons">
                <div className="mode-toggle">
                  <button
                    className={`mode-btn ${playMode === 'standard' ? 'active' : ''}`}
                    onClick={() => handlePlayModeChange('standard')}
                  >
                    🎙️ 标准版
                  </button>
                  <button
                    className={`mode-btn ${playMode === 'child' ? 'active' : ''}`}
                    onClick={() => handlePlayModeChange('child')}
                  >
                    👶 儿童版
                  </button>
                </div>
                <label className="checkbox-label skip-label">
                  <input
                    type="checkbox"
                    checked={skipNoAudio}
                    onChange={(e) => setSkipNoAudio(e.target.checked)}
                  />
                  <span>跳过无音频</span>
                </label>
                <div className="player-controls-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handlePrev}
                    disabled={currentPlayIndex < 0}
                  >
                    ⏮ 上一件
                  </button>
                  {isPlaying ? (
                    <button className="btn btn-warning" onClick={handlePause}>
                      ⏸ 暂停
                    </button>
                  ) : (
                    <button
                      className={`btn btn-primary ${
                        timelineItems.length === 0 || audioItemsCount === 0 ? 'disabled' : ''
                      }`}
                      onClick={handlePlay}
                      disabled={timelineItems.length === 0 || audioItemsCount === 0}
                    >
                      {currentPlayIndex >= 0 ? '▶️ 继续' : '▶️ 播放全部'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleNext}
                    disabled={currentPlayIndex < 0}
                  >
                    下一件 ⏭
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleStop}
                    disabled={currentPlayIndex < 0 && !isPlaying}
                  >
                    ⏹ 停止
                  </button>
                </div>
              </div>
            </div>

            <div className="playback-stats">
              <div>
                进度：{currentPlayIndex < 0 ? 0 : currentPlayIndex + 1} / {timelineItems.length}
              </div>
              <div>
                可播放展品（{playMode === 'standard' ? '标准' : '儿童'}版·{activeLanguage}）：
                <span className="text-success">{audioItemsCount}</span> / {timelineItems.length}
              </div>
            </div>

            <div className="timeline-bar">
              {timelineItems.map((item, index) => {
                const widthPercent =
                  totalDuration > 0
                    ? ((item.endTime - item.startTime) / totalDuration) * 100
                    : 0;
                const isCurrent = index === currentPlayIndex;
                return (
                  <div
                    key={item.id}
                    className={`timeline-segment ${!item.hasAudio ? 'no-audio' : ''} ${
                      isCurrent ? 'active' : ''
                    } ${item.isPathBroken ? 'path-broken' : ''}`}
                    style={{ width: `${widthPercent}%` }}
                    title={`${item.exhibit.title || '未命名展品'} - ${formatDuration(
                      item.endTime - item.startTime
                    )}${item.isPathBroken ? ' (路径失效)' : !item.hasAudio ? ' (无音频)' : ''}`}
                  />
                );
              })}
            </div>

            <div className="timeline-list">
              {timelineItems.map((item, index) => {
                return (
                  <div
                    key={item.id}
                    className={`timeline-list-item ${
                      index === currentPlayIndex ? 'playing' : ''
                    } ${!item.hasAudio ? 'no-audio' : ''} ${
                      item.isPathBroken ? 'path-broken' : ''
                    }`}
                    onClick={() => {
                      if (!item.hasAudio && skipNoAudio) return;
                      setCurrentPlayIndex(index);
                      if (!isPlaying) setIsPlaying(true);
                    }}
                  >
                    <div className="timeline-item-time">{formatDuration(item.startTime)}</div>
                    <div className="timeline-item-dot">
                      {index === currentPlayIndex && isPlaying
                        ? '▶'
                        : item.isPathBroken
                        ? '✖'
                        : !item.hasAudio
                        ? '○'
                        : index + 1}
                    </div>
                    <div className="timeline-item-content">
                      <div className="timeline-item-header">
                        <span className="timeline-item-title">
                          {item.exhibit.title || '未命名展品'}
                          {item.exhibit.isHighlight && <span className="star-icon">⭐</span>}
                        </span>
                        <span className="badge badge-primary">{item.hall}</span>
                      </div>
                      <div className="timeline-item-meta">
                        <span>{item.exhibit.code}</span>
                        <span>⏱️ {formatDuration(item.exhibit.suggestedDuration)}</span>
                        {item.isPathBroken ? (
                          <span className="status-badge error">❌ 音频路径失效</span>
                        ) : item.hasAudio ? (
                          <span className="status-badge success">
                            🔊 {playMode === 'standard' ? '标准版' : '儿童版'}音频就绪
                          </span>
                        ) : (
                          <span className="status-badge warning">
                            ⚠️ {playMode === 'standard' ? '标准版' : '儿童版'}无音频
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'check' && (
          <div className="check-view">
            <div className="check-summary">
              <div className="summary-card">
                <div className="summary-icon">📊</div>
                <div>
                  <div className="summary-value">{currentExhibition.exhibits.length}</div>
                  <div className="summary-label">展品总数</div>
                </div>
              </div>
              <div className="summary-card success">
                <div className="summary-icon">✅</div>
                <div>
                  <div className="summary-value">
                    {currentExhibition.exhibits.length - missingCount}
                  </div>
                  <div className="summary-label">音频完整</div>
                </div>
              </div>
              <div className="summary-card warning">
                <div className="summary-icon">⚠️</div>
                <div>
                  <div className="summary-value">{missingCount - brokenCount}</div>
                  <div className="summary-label">需要完善</div>
                </div>
              </div>
              <div className="summary-card danger">
                <div className="summary-icon">❌</div>
                <div>
                  <div className="summary-value">{brokenCount}</div>
                  <div className="summary-label">路径失效</div>
                </div>
              </div>
            </div>

            <div className="check-legend">
              <span className="text-muted">说明：</span>
              <span className="legend-item">
                <span className="legend-dot success"></span>音频文件已绑定
              </span>
              <span className="legend-item">
                <span className="legend-dot warning"></span>有文本无音频
              </span>
              <span className="legend-item">
                <span className="legend-dot danger"></span>完全缺失
              </span>
              <span className="legend-item">
                <span className="legend-dot error"></span>路径失效
              </span>
            </div>

            <div className="check-list">
              {missingAudioReport.map(({ exhibit, missing, status }) => {
                const hasMissing =
                  missing.standard.length > 0 ||
                  missing.child.length > 0 ||
                  missing.extended.some((e) => e.missing.length > 0);
                const hasBroken =
                  missing.brokenStandard.length > 0 || missing.brokenChild.length > 0;
                const isExpanded = expandedExhibits.has(exhibit.id);

                return (
                  <div
                    key={exhibit.id}
                    className={`check-item ${
                      hasBroken ? 'has-broken' : hasMissing ? 'has-issues' : 'complete'
                    }`}
                  >
                    <div
                      className="check-item-header"
                      onClick={() => toggleExhibitExpand(exhibit.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="check-item-status">
                        {isExpanded ? '▼' : '▶'}&nbsp;
                        {hasBroken ? '❌' : hasMissing ? '⚠️' : '✅'}
                      </div>
                      <div className="check-item-info">
                        <div className="check-item-title">
                          {exhibit.title || '未命名展品'}
                          {exhibit.isHighlight && <span className="star-icon">⭐</span>}
                        </div>
                        <div className="check-item-code">{exhibit.code}</div>
                      </div>
                      <div className="check-item-audio-status">
                        <div
                          className={`audio-status-badge ${
                            missing.brokenStandard.length > 0
                              ? 'error'
                              : missing.standard.length === 0
                              ? 'success'
                              : 'danger'
                          }`}
                        >
                          🎙️ 标准
                          {missing.brokenStandard.length > 0 && ` ❌${missing.brokenStandard.length}`}
                          {missing.standard.length > 0 &&
                            missing.brokenStandard.length === 0 &&
                            ` ⚠${missing.standard.length}`}
                        </div>
                        {status.child && (
                          <div
                            className={`audio-status-badge ${
                              missing.brokenChild.length > 0
                                ? 'error'
                                : missing.child.length === 0
                                ? 'success'
                                : 'danger'
                            }`}
                          >
                            👶 儿童
                            {missing.brokenChild.length > 0 && ` ❌${missing.brokenChild.length}`}
                            {missing.child.length > 0 &&
                              missing.brokenChild.length === 0 &&
                              ` ⚠${missing.child.length}`}
                          </div>
                        )}
                        {status.extended.length > 0 && (
                          <div className="audio-status-badge info">
                            📖 {status.extended.length}个故事
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentExhibit(exhibit.id);
                          setCurrentWindow('exhibit');
                        }}
                      >
                        去编辑
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="check-item-detail">
                        <div className="detail-lang-grid">
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <div key={lang.code} className="detail-lang-col">
                              <div className="detail-lang-name">{lang.name}</div>
                              <div className="detail-section">
                                <span className="detail-label">标准：</span>
                                {status.standard[lang.code].isPathValid === false ? (
                                  <span className="detail-error">❌ 路径失效</span>
                                ) : status.standard[lang.code].hasAudio ? (
                                  <span className="detail-ok">✓ 音频已绑定</span>
                                ) : status.standard[lang.code].hasText ? (
                                  <span className="detail-warning">⚠ 有文本，无音频文件</span>
                                ) : (
                                  <span className="detail-error">✗ 完全缺失</span>
                                )}
                              </div>
                              {status.child && (
                                <div className="detail-section">
                                  <span className="detail-label">儿童：</span>
                                  {status.child[lang.code].isPathValid === false ? (
                                    <span className="detail-error">❌ 路径失效</span>
                                  ) : status.child[lang.code].hasAudio ? (
                                    <span className="detail-ok">✓ 音频已绑定</span>
                                  ) : status.child[lang.code].hasText ? (
                                    <span className="detail-warning">⚠ 有文本，无音频文件</span>
                                  ) : (
                                    <span className="detail-error">✗ 完全缺失</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {status.extended.length > 0 && (
                          <div className="detail-section">
                            <span className="detail-label">延伸故事：</span>
                            <div className="extended-list">
                              {status.extended.map((story, i) => (
                                <div key={i} className="extended-item">
                                  <span>「{story.title || '未命名故事'}」</span>
                                  <div className="extended-lang-status">
                                    {SUPPORTED_LANGUAGES.slice(0, 4).map((lang) => (
                                      <span key={lang.code} title={lang.name}>
                                        {renderLangBadge(story.audio[lang.code])}
                                      </span>
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
          </div>
        )}

        {viewMode === 'publish' && (
          <div className="publish-view">
            <div className="publish-header">
              <div>
                <h3>发布清单确认</h3>
                <p className="text-muted">
                  确认以下信息无误后，可导出游客端数据包或发布清单（点击展品行展开各语言详情）
                </p>
              </div>
              <div className="publish-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleExportPublishChecklist}>
                  📋 导出确认清单
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowExportDialog(true)}
                >
                  📱 导出游客端数据包
                </button>
              </div>
            </div>

            <div className="publish-summary">
              <div className="publish-stat">
                <div className="stat-label">展览名称</div>
                <div className="stat-value">{currentExhibition.name}</div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">展厅数量</div>
                <div className="stat-value">{currentExhibition.halls.length} 个</div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">展品总数</div>
                <div className="stat-value">{sortedRoute.length} 件</div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">总时长</div>
                <div className="stat-value">{formatDuration(totalDuration)}</div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">完整度评分</div>
                <div
                  className={`stat-value ${
                    validation.score >= 90
                      ? 'text-success'
                      : validation.score >= 60
                      ? 'text-warning'
                      : 'text-danger'
                  }`}
                >
                  {validation.score} / 100
                </div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">封面缺失</div>
                <div
                  className={`stat-value ${validation.coversMissing > 0 ? 'text-danger' : 'text-success'}`}
                >
                  {validation.coversMissing} 件
                </div>
              </div>
              {validation.brokenAudioPaths > 0 && (
                <div className="publish-stat full-width error-bg">
                  <div className="stat-label">⚠️ 路径失效</div>
                  <div className="stat-value text-danger">
                    {validation.brokenAudioPaths} 个音频路径
                  </div>
                </div>
              )}
            </div>

            <div className="publish-route">
              <h4>参观路线（按顺序，点击行展开语言详情）</h4>
              <div className="route-table">
                <div className="route-table-header">
                  <span className="col-order">序号</span>
                  <span className="col-exhibit">展品</span>
                  <span className="col-hall">展厅</span>
                  <span className="col-duration">时长</span>
                  <span className="col-status">标准 · 儿童 · 延伸 · 封面</span>
                </div>
                {sortedRoute.map((routeItem, index) => {
                  const exhibit = currentExhibition.exhibits.find(
                    (e) => e.id === routeItem.exhibitId
                  );
                  if (!exhibit) return null;
                  const status = audioStatusForItem(exhibit);
                  const isExpanded = expandedExhibits.has(exhibit.id);
                  const hasIssues =
                    LANG_CODES.some((l) => !status.standard[l].hasAudio) ||
                    (status.child && LANG_CODES.some((l) => !status.child![l].hasAudio));

                  return (
                    <div key={routeItem.id}>
                      <div
                        className={`route-table-row ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleExhibitExpand(exhibit.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="col-order">
                          <span className="order-badge">{index + 1}</span>
                          {exhibit.isHighlight && <span className="highlight-mark">⭐</span>}
                        </span>
                        <span className="col-exhibit">
                          <div className="exhibit-name">{exhibit.title || '未命名展品'}</div>
                          <div className="exhibit-code text-muted">{exhibit.code}</div>
                        </span>
                        <span className="col-hall">{routeItem.hall}</span>
                        <span className="col-duration">
                          {formatDuration(exhibit.suggestedDuration)}
                        </span>
                        <span className="col-status">
                          <div className="inline-status">
                            {SUPPORTED_LANGUAGES.map((lang) => (
                              <span key={lang.code} className="inline-status-group" title={lang.name}>
                                {renderLangBadge(status.standard[lang.code])}
                                {status.child && (
                                  <span style={{ opacity: 0.6 }}>
                                    {renderLangBadge(status.child[lang.code])}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                          <div className="inline-status-second">
                            {status.extended.length > 0 && (
                              <span className="status-pill info">📖 {status.extended.length}</span>
                            )}
                            {exhibit.coverImage ? (
                              <span className="status-pill success">🖼️ 封面</span>
                            ) : (
                              <span className="status-pill danger">🖼️ 无封面</span>
                            )}
                            {hasIssues && (
                              <span className="status-pill warning">⚠ 待完善</span>
                            )}
                          </div>
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="route-table-expand">
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <div key={lang.code} className="expand-row">
                              <span className="expand-lang">{lang.name}</span>
                              <span className="expand-status">
                                <span className="detail-label">标准版：</span>
                                {status.standard[lang.code].isPathValid === false ? (
                                  <span className="detail-error">❌ 路径失效</span>
                                ) : status.standard[lang.code].hasAudio ? (
                                  <span className="detail-ok">✓ 音频</span>
                                ) : status.standard[lang.code].hasText ? (
                                  <span className="detail-warning">⚠ 有文无音</span>
                                ) : (
                                  <span className="detail-error">✗ 缺失</span>
                                )}
                                {status.child && (
                                  <>
                                    <span style={{ margin: '0 12px' }}>|</span>
                                    <span className="detail-label">儿童版：</span>
                                    {status.child[lang.code].isPathValid === false ? (
                                      <span className="detail-error">❌ 路径失效</span>
                                    ) : status.child[lang.code].hasAudio ? (
                                      <span className="detail-ok">✓ 音频</span>
                                    ) : status.child[lang.code].hasText ? (
                                      <span className="detail-warning">⚠ 有文无音</span>
                                    ) : (
                                      <span className="detail-error">✗ 缺失</span>
                                    )}
                                  </>
                                )}
                              </span>
                            </div>
                          ))}
                          {status.extended.length > 0 && (
                            <div className="expand-row">
                              <span className="expand-lang">延伸故事</span>
                              <span className="expand-status">
                                {status.extended.map((s, i) => (
                                  <div key={i} style={{ marginBottom: 4 }}>
                                    📖 {s.title || '未命名'}：
                                    {SUPPORTED_LANGUAGES.map((lang) => (
                                      <span key={lang.code} style={{ marginLeft: 8 }}>
                                        [{lang.code}]
                                        {s.audio[lang.code].hasAudio ? '✓' : s.audio[lang.code].hasText ? '⚠' : '✗'}
                                      </span>
                                    ))}
                                  </div>
                                ))}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="publish-summary-section">
              <h4>各语言音频完成度</h4>
              <div className="language-completion">
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const langStatus = currentExhibition.exhibits.map((e) =>
                    getExhibitAudioStatus(e, [lang.code], fileValidity)
                  );
                  const standardComplete = langStatus.filter(
                    (s) => s.standard[lang.code]?.hasAudio
                  ).length;
                  const standardBroken = langStatus.filter(
                    (s) => s.standard[lang.code]?.isPathValid === false
                  ).length;
                  const childHas = langStatus.filter((s) => s.child !== null).length;
                  const childComplete = langStatus.filter(
                    (s) => s.child?.[lang.code]?.hasAudio
                  ).length;
                  const childBroken = langStatus.filter(
                    (s) => s.child?.[lang.code]?.isPathValid === false
                  ).length;
                  const exhibitCount = currentExhibition.exhibits.length || 1;

                  return (
                    <div key={lang.code} className="lang-completion-item">
                      <div className="lang-name">{lang.name}</div>
                      <div className="completion-bars">
                        <div className="completion-row">
                          <span className="completion-label">标准版</span>
                          <div className="completion-bar">
                            <div
                              className="completion-fill success"
                              style={{
                                width: `${(standardComplete / exhibitCount) * 100}%`,
                              }}
                            />
                            {standardBroken > 0 && (
                              <div
                                className="completion-fill error"
                                style={{
                                  width: `${(standardBroken / exhibitCount) * 100}%`,
                                  position: 'absolute',
                                  left: `${((standardComplete - standardBroken) / exhibitCount) * 100}%`,
                                }}
                              />
                            )}
                          </div>
                          <span className="completion-value">
                            {standardComplete}/{exhibitCount}
                            {standardBroken > 0 && <span className="text-danger"> ❌{standardBroken}</span>}
                          </span>
                        </div>
                        {childHas > 0 && (
                          <div className="completion-row">
                            <span className="completion-label">儿童版</span>
                            <div className="completion-bar">
                              <div
                                className="completion-fill success"
                                style={{
                                  width: `${(childComplete / childHas) * 100}%`,
                                }}
                              />
                              {childBroken > 0 && (
                                <div
                                  className="completion-fill error"
                                  style={{
                                    width: `${(childBroken / childHas) * 100}%`,
                                  }}
                                />
                              )}
                            </div>
                            <span className="completion-value">
                              {childComplete}/{childHas}
                              {childBroken > 0 && <span className="text-danger"> ❌{childBroken}</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="visitor-preview">
            <div className="phone-frame">
              <div className="phone-screen">
                <div className="visitor-header">
                  <h3>{currentExhibition.name}</h3>
                  <p className="visitor-subtitle">语音导览</p>
                </div>
                <div className="visitor-list">
                  {timelineItems.map((item, index) => (
                    <div key={item.id} className="visitor-item">
                      <div className="visitor-item-index">{index + 1}</div>
                      <div className="visitor-item-image">
                        {item.exhibit.coverImage ? (
                          <img src={item.exhibit.coverImage} alt="" />
                        ) : (
                          <div className="placeholder-img">🖼️</div>
                        )}
                      </div>
                      <div className="visitor-item-info">
                        <div className="visitor-item-title">
                          {item.exhibit.title || '未命名展品'}
                          {item.exhibit.isHighlight && <span className="star-icon">⭐</span>}
                        </div>
                        <div className="visitor-item-meta">
                          <span>{item.hall}</span>
                          <span>·</span>
                          <span>⏱️ {formatDuration(item.exhibit.suggestedDuration)}</span>
                        </div>
                        <div className="visitor-item-badges">
                          {item.exhibit.childAudio && (
                            <span className="badge badge-primary">👶 儿童版</span>
                          )}
                          {(item.exhibit.extendedStories?.length || 0) > 0 && (
                            <span className="badge badge-info">📖 延伸故事</span>
                          )}
                          {!item.hasAudio && (
                            <span className="badge badge-warning">⚠ 无音频</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {timelineItems.length === 0 && (
                    <div className="empty-state small">
                      <div className="empty-state-text">路线中还没有展品</div>
                      <div className="empty-state-hint">请先到路线编排中添加展品</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showExportDialog && (
        <div className="modal-overlay" onClick={() => setShowExportDialog(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📱 导出游客端数据包</h3>
              <button className="btn-close" onClick={() => setShowExportDialog(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-label">选择导出语言（至少选择一种）</div>
                <div className="lang-checkboxes">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <label
                      key={lang.code}
                      className={`checkbox-label lang-checkbox ${
                        exportOptions.languages.includes(lang.code) ? 'checked' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={exportOptions.languages.includes(lang.code)}
                        onChange={() => toggleExportLanguage(lang.code)}
                      />
                      <span>{lang.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-section">
                <div className="form-label">导出内容</div>
                <div className="option-checkboxes">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeStandard}
                      onChange={(e) =>
                        setExportOptions({ ...exportOptions, includeStandard: e.target.checked })
                      }
                    />
                    <span>标准讲解（必须有）</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeChild}
                      onChange={(e) =>
                        setExportOptions({ ...exportOptions, includeChild: e.target.checked })
                      }
                    />
                    <span>儿童版讲解</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeExtended}
                      onChange={(e) =>
                        setExportOptions({ ...exportOptions, includeExtended: e.target.checked })
                      }
                    />
                    <span>延伸故事</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeCovers}
                      onChange={(e) =>
                        setExportOptions({ ...exportOptions, includeCovers: e.target.checked })
                      }
                    />
                    <span>封面图片路径</span>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeTranscripts}
                      onChange={(e) =>
                        setExportOptions({ ...exportOptions, includeTranscripts: e.target.checked })
                      }
                    />
                    <span>讲解词文本（字幕用）</span>
                  </label>
                </div>
              </div>
              <div className="validation-preview">
                <div className="validation-preview-title">📊 数据包预览</div>
                <div className="validation-preview-grid">
                  <div>导出语言：{exportOptions.languages.length} 种</div>
                  <div>展品数量：{sortedRoute.length} 件</div>
                  <div>
                    预计缺失：
                    {Object.entries(
                      buildTourValidation(
                        currentExhibition,
                        exportOptions.languages,
                        fileValidity
                      ).standardAudioMissing
                    ).reduce((s, [, v]) => s + v, 0)}{' '}
                    条标准音频
                  </div>
                  <div>
                    完整度评分：
                    <span
                      className={
                        validation.score >= 90
                          ? 'text-success'
                          : validation.score >= 60
                          ? 'text-warning'
                          : 'text-danger'
                      }
                    >
                      {validation.score}/100
                    </span>
                  </div>
                  {validation.brokenAudioPaths > 0 && (
                    <div className="text-danger full-width">
                      ⚠️ 检测到 {validation.brokenAudioPaths} 个失效音频路径
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowExportDialog(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExportTourData}
                disabled={exportOptions.languages.length === 0}
              >
                📥 导出 JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PreviewPanel;
