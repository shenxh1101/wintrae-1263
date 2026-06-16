import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, Exhibit } from '@shared/types';
import {
  formatDuration,
  checkMissingAudio,
  exportChecklist,
} from '@shared/utils';
import '../styles/preview.css';

interface TimelineItem {
  id: string;
  exhibit: Exhibit;
  hall: string;
  order: number;
  startTime: number;
  endTime: number;
}

function PreviewPanel() {
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const setCurrentWindow = useAppStore((state) => state.setCurrentWindow);
  const setCurrentExhibit = useAppStore((state) => state.setCurrentExhibit);

  const [activeLanguage, setActiveLanguage] = useState(DEFAULT_LANGUAGE);
  const [viewMode, setViewMode] = useState<'timeline' | 'check' | 'preview'>('timeline');
  const [currentPlayIndex, setCurrentPlayIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<'standard' | 'child'>('standard');
  const audioRef = useRef<HTMLAudioElement>(null);

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
      const timelineItem: TimelineItem = {
        id: item.id,
        exhibit: exhibit!,
        hall: item.hall,
        order: item.order,
        startTime: currentTime,
        endTime: currentTime + duration,
      };
      currentTime += duration;
      return timelineItem;
    });
  }, [sortedRoute, currentExhibition.exhibits]);

  const totalDuration = timelineItems.length > 0
    ? timelineItems[timelineItems.length - 1].endTime
    : 0;

  const missingAudioReport = useMemo(() => {
    const languages = [activeLanguage];
    return currentExhibition.exhibits.map((exhibit) => ({
      exhibit,
      missing: checkMissingAudio(exhibit, languages),
    }));
  }, [currentExhibition.exhibits, activeLanguage]);

  const missingCount = missingAudioReport.filter(
    (r) =>
      r.missing.standard.length > 0 ||
      r.missing.child.length > 0 ||
      r.missing.extended.some((e) => e.missing.length > 0)
  ).length;

  useEffect(() => {
    if (!isPlaying || currentPlayIndex < 0) return;

    const item = timelineItems[currentPlayIndex];
    if (!item) {
      setIsPlaying(false);
      return;
    }

    const audio = item.exhibit.standardAudio[activeLanguage]?.audioPath;
    if (audioRef.current && audio) {
      audioRef.current.src = `file:///${audio}`;
      audioRef.current.play().catch(() => {});
    }

    const duration = item.exhibit.suggestedDuration * 1000;
    const timer = setTimeout(() => {
      if (currentPlayIndex < timelineItems.length - 1) {
        setCurrentPlayIndex(currentPlayIndex + 1);
      } else {
        setIsPlaying(false);
        setCurrentPlayIndex(-1);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [isPlaying, currentPlayIndex, timelineItems, activeLanguage]);

  const handlePlay = () => {
    if (timelineItems.length === 0) return;
    setCurrentPlayIndex(0);
    setIsPlaying(true);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentPlayIndex(-1);
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

  const currentItem = currentPlayIndex >= 0 ? timelineItems[currentPlayIndex] : null;

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div>
          <h2>试听与发布</h2>
          <p className="text-muted">
            共 {currentExhibition.exhibits.length} 件展品 · {timelineItems.length} 个路线节点 · 总时长 {formatDuration(totalDuration)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
            📊 导出讲解清单
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportJSON}>
            💾 导出JSON数据
          </button>
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
                  </>
                ) : (
                  <span className="text-muted">点击播放按钮开始试听整条路线</span>
                )}
              </div>
              <div className="playback-buttons">
                <div className="mode-toggle">
                  <button
                    className={`mode-btn ${playMode === 'standard' ? 'active' : ''}`}
                    onClick={() => setPlayMode('standard')}
                  >
                    🎙️ 标准版
                  </button>
                  <button
                    className={`mode-btn ${playMode === 'child' ? 'active' : ''}`}
                    onClick={() => setPlayMode('child')}
                  >
                    👶 儿童版
                  </button>
                </div>
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
                      } ${item.exhibit.isHighlight ? 'highlight' : ''}`}
                      style={{ width: `${widthPercent}%` }}
                      title={`${item.exhibit.title || '未命名展品'} - ${formatDuration(
                        item.exhibit.suggestedDuration
                      )}`}
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
              {timelineItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`timeline-list-item ${
                    index === currentPlayIndex ? 'playing' : ''
                  }`}
                  onClick={() => {
                    setCurrentPlayIndex(index);
                    if (!isPlaying) setIsPlaying(true);
                  }}
                >
                  <div className="timeline-item-time">
                    {formatDuration(item.startTime)}
                  </div>
                  <div className="timeline-item-dot">
                    {index === currentPlayIndex && isPlaying ? '▶' : index + 1}
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
                    </div>
                  </div>
                </div>
              ))}
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

            <div className="check-list">
              {missingAudioReport.map(({ exhibit, missing }) => {
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
                      <div className="check-item-status">
                        {hasMissing ? '⚠️' : '✅'}
                      </div>
                      <div className="check-item-info">
                        <div className="check-item-title">
                          {exhibit.title || '未命名展品'}
                          {exhibit.isHighlight && <span className="star-icon">⭐</span>}
                        </div>
                        <div className="check-item-code">{exhibit.code}</div>
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
                      <div className="check-item-issues">
                        {missing.standard.length > 0 && (
                          <div className="issue-tag">
                            🎙️ 标准讲解词缺失
                          </div>
                        )}
                        {missing.child.length > 0 && (
                          <div className="issue-tag">
                            👶 儿童讲解词缺失
                          </div>
                        )}
                        {missing.extended
                          .filter((e) => e.missing.length > 0)
                          .map((e, i) => (
                            <div key={i} className="issue-tag">
                              📖 延伸故事"{e.title}"缺失
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                          {item.exhibit.isHighlight && <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                            重点
                          </span>}
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
                      <button className="play-button">▶</button>
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
                  <strong>{currentExhibition.exhibits.filter((e) => e.isHighlight).length}</strong>
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
