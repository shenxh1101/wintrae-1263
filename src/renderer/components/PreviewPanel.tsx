import { useState, useEffect, useMemo, useRef } from 'react';
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
}

type ViewMode = 'timeline' | 'check' | 'publish' | 'preview';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const timelineItems: TimelineItem[] = useMemo(() => {
    let currentTime = 0;
    return sortedRoute.map((item) => {
      const exhibit = currentExhibition.exhibits.find((e) => e.id === item.exhibitId);
      const duration = exhibit?.suggestedDuration || 120;
      const hasAudio = exhibit ? hasAudioFile(exhibit, activeLanguage, playMode) : false;
      const timelineItem: TimelineItem = {
        id: item.id,
        exhibit: exhibit!,
        hall: item.hall,
        order: item.order,
        startTime: currentTime,
        endTime: currentTime + duration,
        hasAudio,
      };
      currentTime += duration;
      return timelineItem;
    });
  }, [sortedRoute, currentExhibition.exhibits, activeLanguage, playMode]);

  const totalDuration =
    timelineItems.length > 0 ? timelineItems[timelineItems.length - 1].endTime : 0;

  const audioItemsCount = timelineItems.filter((item) => item.hasAudio).length;

  const missingAudioReport = useMemo(() => {
    const languages = [activeLanguage];
    return currentExhibition.exhibits.map((exhibit) => ({
      exhibit,
      missing: checkMissingAudio(exhibit, languages),
      status: getExhibitAudioStatus(exhibit, languages),
    }));
  }, [currentExhibition.exhibits, activeLanguage]);

  const missingCount = missingAudioReport.filter(
    (r) =>
      r.missing.standard.length > 0 ||
      r.missing.child.length > 0 ||
      r.missing.extended.some((e) => e.missing.length > 0)
  ).length;

  const findNextPlayableIndex = (fromIndex: number): number => {
    for (let i = fromIndex; i < timelineItems.length; i++) {
      if (timelineItems[i].hasAudio) {
        return i;
      }
    }
    return -1;
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

    let audioPath: string | undefined;
    if (playMode === 'standard') {
      audioPath = item.exhibit.standardAudio[activeLanguage]?.audioPath;
    } else {
      audioPath = item.exhibit.childAudio?.[activeLanguage]?.audioPath;
    }

    if (audioRef.current && audioPath) {
      audioRef.current.src = `file:///${audioPath}`;
      audioRef.current.play().catch(() => {});
    }

    const duration = item.exhibit.suggestedDuration * 1000;
    timerRef.current = setTimeout(() => {
      const nextIndex = skipNoAudio
        ? findNextPlayableIndex(currentPlayIndex + 1)
        : currentPlayIndex + 1;

      if (nextIndex >= 0 && nextIndex < timelineItems.length) {
        setCurrentPlayIndex(nextIndex);
      } else {
        setIsPlaying(false);
        setCurrentPlayIndex(-1);
      }
    }, duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPlaying, currentPlayIndex, timelineItems, activeLanguage, playMode, skipNoAudio]);

  useEffect(() => {
    if (isPlaying && currentPlayIndex >= 0 && !timelineItems[currentPlayIndex]?.hasAudio) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    }
  }, [currentPlayIndex, isPlaying, timelineItems]);

  const handlePlay = () => {
    if (timelineItems.length === 0) return;
    const startIndex = skipNoAudio ? findNextPlayableIndex(0) : 0;
    if (startIndex < 0) {
      alert('当前模式下没有可播放的音频展品');
      return;
    }
    setCurrentPlayIndex(startIndex);
    setIsPlaying(true);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentPlayIndex(-1);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

  const handleExportCSV = async () => {
    const csv = exportChecklist(currentExhibition, [activeLanguage]);
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
    const languages = [activeLanguage];
    const tourPackage = buildTourDataPackage(currentExhibition, languages);
    const data = JSON.stringify(tourPackage, null, 2);
    const filename = `${currentExhibition.name}_游客端数据包.json`;
    await window.electronAPI.saveFile(data, filename);
  };

  const handleExportPublishChecklist = async () => {
    const content = exportPublishChecklist(currentExhibition, [activeLanguage]);
    const filename = `${currentExhibition.name}_发布确认清单.txt`;
    await window.electronAPI.saveFile(content, filename);
  };

  const currentItem = currentPlayIndex >= 0 ? timelineItems[currentPlayIndex] : null;

  const audioStatusForItem = (exhibit: Exhibit): ExhibitAudioStatus => {
    return getExhibitAudioStatus(exhibit, [activeLanguage]);
  };

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div>
          <h2>试听与发布</h2>
          <p className="text-muted">
            共 {currentExhibition.exhibits.length} 件展品 · {timelineItems.length} 个路线节点 ·
            总时长 {formatDuration(totalDuration)}
          </p>
        </div>
        <div className="export-buttons">
          <div className="export-dropdown">
            <button className="btn btn-primary btn-sm">📤 导出</button>
            <div className="export-menu">
              <button onClick={handleExportCSV}>📊 讲解清单（CSV）</button>
              <button onClick={handleExportPublishChecklist}>📋 发布确认清单</button>
              <button onClick={handleExportTourData}>📱 游客端数据包</button>
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
          {missingCount > 0 && (
            <span className="badge badge-danger" style={{ marginLeft: 8 }}>
              {missingCount} 项缺失
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
                    {!currentItem.hasAudio && (
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
                    onClick={() => {
                      setPlayMode('standard');
                      if (isPlaying) handleStop();
                    }}
                  >
                    🎙️ 标准版
                  </button>
                  <button
                    className={`mode-btn ${playMode === 'child' ? 'active' : ''}`}
                    onClick={() => {
                      setPlayMode('child');
                      if (isPlaying) handleStop();
                    }}
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
                {!isPlaying ? (
                  <button className="btn btn-primary" onClick={handlePlay}>
                    ▶️ 播放全部
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={handleStop}>
                    ⏹️ 停止
                  </button>
                )}
              </div>
            </div>

            <audio ref={audioRef} style={{ display: 'none' }} />

            <div className="playback-stats">
              <span className="text-muted">
                当前模式：{playMode === 'standard' ? '标准版' : '儿童版'} ·
                可播放 {audioItemsCount}/{timelineItems.length} 件
              </span>
              {audioItemsCount < timelineItems.length && (
                <span className="badge badge-warning">
                  {timelineItems.length - audioItemsCount} 件无音频
                </span>
              )}
            </div>

            <div className="timeline-container">
              <div className="timeline-track">
                {timelineItems.map((item, index) => {
                  const widthPercent =
                    totalDuration > 0 ? ((item.endTime - item.startTime) / totalDuration) * 100 : 0;
                  return (
                    <div
                      key={item.id}
                      className={`timeline-segment ${
                        index === currentPlayIndex ? 'playing' : ''
                      } ${item.exhibit.isHighlight ? 'highlight' : ''} ${
                        !item.hasAudio ? 'no-audio' : ''
                      }`}
                      style={{ width: `${widthPercent}%` }}
                      title={`${item.exhibit.title || '未命名展品'} - ${formatDuration(
                        item.exhibit.suggestedDuration
                      )}${item.hasAudio ? '' : ' (无音频)'}`}
                    >
                      <span className="segment-index">{index + 1}</span>
                    </div>
                  );
                })}
              </div>
              <div className="timeline-labels">
                <span>0:00</span>
                <span>{formatDuration(Math.floor(totalDuration / 2))}</span>
                <span>{formatDuration(totalDuration)}</span>
              </div>
            </div>

            <div className="timeline-list">
              {timelineItems.map((item, index) => {
                const status = audioStatusForItem(item.exhibit);
                return (
                  <div
                    key={item.id}
                    className={`timeline-list-item ${
                      index === currentPlayIndex ? 'playing' : ''
                    } ${!item.hasAudio ? 'no-audio' : ''}`}
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
                        {item.hasAudio ? (
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
                  <div className="summary-value">{missingCount}</div>
                  <div className="summary-label">需要完善</div>
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
            </div>

            <div className="check-list">
              {missingAudioReport.map(({ exhibit, missing, status }) => {
                const hasMissing =
                  missing.standard.length > 0 ||
                  missing.child.length > 0 ||
                  missing.extended.some((e) => e.missing.length > 0);

                return (
                  <div
                    key={exhibit.id}
                    className={`check-item ${hasMissing ? 'has-issues' : 'complete'}`}
                  >
                    <div className="check-item-header">
                      <div className="check-item-status">{hasMissing ? '⚠️' : '✅'}</div>
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
                            status.standard[activeLanguage].hasAudio ? 'success' : 'danger'
                          }`}
                        >
                          🎙️ 标准
                        </div>
                        {status.child && (
                          <div
                            className={`audio-status-badge ${
                              status.child[activeLanguage].hasAudio ? 'success' : 'danger'
                            }`}
                          >
                            👶 儿童
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
                        onClick={() => {
                          setCurrentExhibit(exhibit.id);
                          setCurrentWindow('exhibit');
                        }}
                      >
                        去编辑
                      </button>
                    </div>
                    {hasMissing && (
                      <div className="check-item-detail">
                        <div className="detail-section">
                          <span className="detail-label">标准版：</span>
                          {status.standard[activeLanguage].hasAudio ? (
                            <span className="detail-ok">✓ 音频已绑定</span>
                          ) : status.standard[activeLanguage].hasText ? (
                            <span className="detail-warning">⚠ 有文本，无音频文件</span>
                          ) : (
                            <span className="detail-error">✗ 完全缺失</span>
                          )}
                        </div>
                        {status.child && (
                          <div className="detail-section">
                            <span className="detail-label">儿童版：</span>
                            {status.child[activeLanguage].hasAudio ? (
                              <span className="detail-ok">✓ 音频已绑定</span>
                            ) : status.child[activeLanguage].hasText ? (
                              <span className="detail-warning">⚠ 有文本，无音频文件</span>
                            ) : (
                              <span className="detail-error">✗ 完全缺失</span>
                            )}
                          </div>
                        )}
                        {status.extended.length > 0 && (
                          <div className="detail-section">
                            <span className="detail-label">延伸故事：</span>
                            <div className="extended-list">
                              {status.extended.map((story, i) => (
                                <div key={i} className="extended-item">
                                  <span>「{story.title || '未命名故事'}」</span>
                                  {story.audio[activeLanguage].hasAudio ? (
                                    <span className="detail-ok">✓</span>
                                  ) : (
                                    <span className="detail-warning">⚠ 无音频</span>
                                  )}
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
                  确认以下信息无误后，可导出游客端数据包或发布清单
                </p>
              </div>
              <div className="publish-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleExportPublishChecklist}>
                  📋 导出确认清单
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleExportTourData}>
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
                <div className="stat-label">重点展品</div>
                <div className="stat-value">
                  {currentExhibition.exhibits.filter((e) => e.isHighlight).length} 件
                </div>
              </div>
              <div className="publish-stat">
                <div className="stat-label">儿童版</div>
                <div className="stat-value">
                  {currentExhibition.exhibits.filter((e) => e.childAudio).length} 件
                </div>
              </div>
            </div>

            <div className="publish-route">
              <h4>参观路线（按顺序）</h4>
              <div className="route-table">
                <div className="route-table-header">
                  <span className="col-order">序号</span>
                  <span className="col-exhibit">展品</span>
                  <span className="col-hall">展厅</span>
                  <span className="col-duration">时长</span>
                  <span className="col-standard">标准版</span>
                  <span className="col-child">儿童版</span>
                  <span className="col-extended">延伸故事</span>
                </div>
                {sortedRoute.map((routeItem, index) => {
                  const exhibit = currentExhibition.exhibits.find(
                    (e) => e.id === routeItem.exhibitId
                  );
                  if (!exhibit) return null;
                  const status = audioStatusForItem(exhibit);

                  return (
                    <div key={routeItem.id} className="route-table-row">
                      <span className="col-order">
                        <span className="order-badge">{index + 1}</span>
                        {exhibit.isHighlight && <span className="highlight-mark">⭐</span>}
                      </span>
                      <span className="col-exhibit">
                        <div className="exhibit-name">{exhibit.title || '未命名展品'}</div>
                        <div className="exhibit-code text-muted">{exhibit.code}</div>
                      </span>
                      <span className="col-hall">{routeItem.hall}</span>
                      <span className="col-duration">{formatDuration(exhibit.suggestedDuration)}</span>
                      <span className="col-standard">
                        {status.standard[activeLanguage].hasAudio ? (
                          <span className="status-pill success">🔊 音频</span>
                        ) : status.standard[activeLanguage].hasText ? (
                          <span className="status-pill warning">📝 仅文本</span>
                        ) : (
                          <span className="status-pill danger">✗ 缺失</span>
                        )}
                      </span>
                      <span className="col-child">
                        {status.child ? (
                          status.child[activeLanguage].hasAudio ? (
                            <span className="status-pill success">🔊 音频</span>
                          ) : status.child[activeLanguage].hasText ? (
                            <span className="status-pill warning">📝 仅文本</span>
                          ) : (
                            <span className="status-pill danger">✗ 缺失</span>
                          )
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </span>
                      <span className="col-extended">
                        {status.extended.length > 0 ? (
                          <span className="status-pill info">
                            📖 {status.extended.length} 个
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </span>
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
                    getExhibitAudioStatus(e, [lang.code])
                  );
                  const standardComplete = langStatus.filter(
                    (s) => s.standard[lang.code]?.hasAudio
                  ).length;
                  const childHas = langStatus.filter((s) => s.child !== null).length;
                  const childComplete = langStatus.filter(
                    (s) => s.child?.[lang.code]?.hasAudio
                  ).length;

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
                                width: `${(standardComplete / currentExhibition.exhibits.length) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="completion-value">
                            {standardComplete}/{currentExhibition.exhibits.length}
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
                            </div>
                            <span className="completion-value">
                              {childComplete}/{childHas}
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
                          {item.exhibit.isHighlight && (
                            <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                              重点
                            </span>
                          )}
                        </div>
                        <div className="visitor-item-meta">
                          <span>{item.hall}</span>
                          <span>⏱️ {formatDuration(item.exhibit.suggestedDuration)}</span>
                        </div>
                        {item.exhibit.childAudio && (
                          <div className="visitor-item-child">
                            <span className="badge badge-success">👶 儿童版</span>
                          </div>
                        )}
                        {(item.exhibit.extendedStories?.length || 0) > 0 && (
                          <div className="visitor-item-stories">
                            <span className="badge badge-primary">
                              📖 {item.exhibit.extendedStories?.length} 个延伸故事
                            </span>
                          </div>
                        )}
                      </div>
                      <button className={`play-button ${!item.hasAudio ? 'disabled' : ''}`}>
                        {item.hasAudio ? '▶' : '○'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="preview-info">
              <h4>游客端展示预览</h4>
              <p className="text-muted">
                以上模拟游客在手机端看到的导览顺序。展品按照您编排的路线顺序展示，
                重点展品会突出显示，支持标准版和儿童版切换，以及延伸故事扩展阅读。
              </p>
              <div className="preview-stats">
                <div>
                  <strong>{timelineItems.length}</strong>
                  <span className="text-muted"> 个参观节点</span>
                </div>
                <div>
                  <strong>{formatDuration(totalDuration)}</strong>
                  <span className="text-muted"> 预计参观时长</span>
                </div>
                <div>
                  <strong>
                    {currentExhibition.exhibits.filter((e) => e.isHighlight).length}
                  </strong>
                  <span className="text-muted"> 件重点展品</span>
                </div>
                <div>
                  <strong>
                    {currentExhibition.exhibits.filter((e) => e.childAudio).length}
                  </strong>
                  <span className="text-muted"> 件含儿童讲解</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewPanel;
