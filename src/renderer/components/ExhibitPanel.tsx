import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@shared/types';
import '../styles/exhibit.css';

function ExhibitPanel() {
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const currentExhibit = useAppStore((state) => state.getCurrentExhibit());
  const setCurrentExhibit = useAppStore((state) => state.setCurrentExhibit);
  const addExhibit = useAppStore((state) => state.addExhibit);
  const updateExhibit = useAppStore((state) => state.updateExhibit);
  const deleteExhibit = useAppStore((state) => state.deleteExhibit);
  const updateExhibitAudio = useAppStore((state) => state.updateExhibitAudio);
  const toggleChildAudio = useAppStore((state) => state.toggleChildAudio);
  const addExtendedStory = useAppStore((state) => state.addExtendedStory);
  const updateExtendedStory = useAppStore((state) => state.updateExtendedStory);
  const deleteExtendedStory = useAppStore((state) => state.deleteExtendedStory);

  const [activeTab, setActiveTab] = useState<'basic' | 'standard' | 'child' | 'extended'>('basic');
  const [activeLanguage, setActiveLanguage] = useState(DEFAULT_LANGUAGE);
  const [searchText, setSearchText] = useState('');

  if (!currentExhibition) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div className="empty-state-text">请先在展览总览中选择一个展览</div>
      </div>
    );
  }

  const filteredExhibits = currentExhibition.exhibits.filter(
    (ex) =>
      ex.title.toLowerCase().includes(searchText.toLowerCase()) ||
      ex.code.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelectImage = async () => {
    if (!currentExhibit) return;
    const path = await window.electronAPI.selectImage();
    if (path && currentExhibition) {
      updateExhibit(currentExhibition.id, currentExhibit.id, { coverImage: path });
    }
  };

  const handleSelectAudio = async (audioType: 'standardAudio' | 'childAudio') => {
    if (!currentExhibit) return;
    const path = await window.electronAPI.selectAudio();
    if (path && currentExhibition) {
      updateExhibitAudio(currentExhibition.id, currentExhibit.id, audioType, activeLanguage, {
        audioPath: path,
      });
    }
  };

  const handleStoryAudio = async (storyId: string) => {
    if (!currentExhibit) return;
    const path = await window.electronAPI.selectAudio();
    if (path && currentExhibition) {
      const story = currentExhibit.extendedStories?.find((s) => s.id === storyId);
      if (story) {
        const currentAudio = story.audio || {};
        const langAudio = currentAudio[activeLanguage] || { text: '', audioPath: undefined };
        updateExtendedStory(currentExhibition.id, currentExhibit.id, storyId, {
          audio: {
            ...currentAudio,
            [activeLanguage]: { ...langAudio, audioPath: path },
          },
        });
      }
    }
  };

  return (
    <div className="exhibit-panel">
      <aside className="exhibit-sidebar">
        <div className="sidebar-header">
          <h3>展品列表</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => addExhibit(currentExhibition.id)}
          >
            ➕ 新增
          </button>
        </div>
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="🔍 搜索展品..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="exhibit-list">
          {filteredExhibits.length === 0 ? (
            <div className="sidebar-empty">
              <p>暂无展品</p>
              <p className="text-muted">点击上方按钮添加第一个展品</p>
            </div>
          ) : (
            filteredExhibits.map((exhibit) => (
              <div
                key={exhibit.id}
                className={`exhibit-list-item ${
                  currentExhibit?.id === exhibit.id ? 'active' : ''
                }`}
                onClick={() => setCurrentExhibit(exhibit.id)}
              >
                {exhibit.coverImage ? (
                  <img src={exhibit.coverImage} alt="" className="exhibit-thumb" />
                ) : (
                  <div className="exhibit-thumb placeholder">🖼️</div>
                )}
                <div className="exhibit-info">
                  <div className="exhibit-code">{exhibit.code}</div>
                  <div className="exhibit-title">
                    {exhibit.title || '未命名展品'}
                    {exhibit.isHighlight && <span className="star-icon">⭐</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="exhibit-editor">
        {!currentExhibit ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <div className="empty-state-text">从左侧选择或创建一个展品开始编辑</div>
          </div>
        ) : (
          <>
            <div className="editor-header">
              <div>
                <h2>{currentExhibit.title || '未命名展品'}</h2>
                <p className="text-muted">
                  编号：{currentExhibit.code}
                  {currentExhibit.isHighlight && (
                    <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                      ⭐ 重点展品
                    </span>
                  )}
                </p>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm('确定要删除这个展品吗？')) {
                    deleteExhibit(currentExhibition.id, currentExhibit.id);
                  }
                }}
              >
                🗑️ 删除展品
              </button>
            </div>

            <div className="tab-bar">
              <button
                className={`tab-item ${activeTab === 'basic' ? 'active' : ''}`}
                onClick={() => setActiveTab('basic')}
              >
                📝 基本信息
              </button>
              <button
                className={`tab-item ${activeTab === 'standard' ? 'active' : ''}`}
                onClick={() => setActiveTab('standard')}
              >
                🎙️ 标准讲解
              </button>
              <button
                className={`tab-item ${activeTab === 'child' ? 'active' : ''}`}
                onClick={() => setActiveTab('child')}
              >
                👶 儿童讲解
              </button>
              <button
                className={`tab-item ${activeTab === 'extended' ? 'active' : ''}`}
                onClick={() => setActiveTab('extended')}
              >
                📖 延伸故事
              </button>
            </div>

            <div className="language-switcher">
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

            <div className="editor-content">
              {activeTab === 'basic' && (
                <div className="basic-info">
                  <div className="form-row">
                    <div className="form-group">
                      <label>展品编号</label>
                      <input
                        type="text"
                        value={currentExhibit.code}
                        onChange={(e) =>
                          updateExhibit(currentExhibition.id, currentExhibit.id, {
                            code: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>展品名称</label>
                      <input
                        type="text"
                        placeholder="请输入展品名称"
                        value={currentExhibit.title}
                        onChange={(e) =>
                          updateExhibit(currentExhibition.id, currentExhibit.id, {
                            title: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>建议停留时长（秒）</label>
                      <input
                        type="number"
                        min="10"
                        step="10"
                        value={currentExhibit.suggestedDuration}
                        onChange={(e) =>
                          updateExhibit(currentExhibition.id, currentExhibit.id, {
                            suggestedDuration: parseInt(e.target.value) || 120,
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>是否为重点展品</label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={currentExhibit.isHighlight}
                          onChange={(e) =>
                            updateExhibit(currentExhibition.id, currentExhibit.id, {
                              isHighlight: e.target.checked,
                            })
                          }
                        />
                        <span>标记为重点展品（将在路线中突出显示）</span>
                      </label>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>展品简介</label>
                    <textarea
                      placeholder="请输入展品简介，用于游客端展示"
                      value={currentExhibit.description}
                      onChange={(e) =>
                        updateExhibit(currentExhibition.id, currentExhibit.id, {
                          description: e.target.value,
                        })
                      }
                      rows={4}
                    />
                  </div>
                  <div className="form-group">
                    <label>封面图片</label>
                    <div className="cover-upload">
                      {currentExhibit.coverImage ? (
                        <div className="cover-preview">
                          <img src={currentExhibit.coverImage} alt="封面" />
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              updateExhibit(currentExhibition.id, currentExhibit.id, {
                                coverImage: undefined,
                              })
                            }
                          >
                            移除图片
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-secondary" onClick={handleSelectImage}>
                          📷 选择封面图片
                        </button>
                      )}
                      {!currentExhibit.coverImage && (
                        <p className="text-muted" style={{ marginTop: 8 }}>
                          支持 JPG、PNG、WEBP 格式
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'standard' && (
                <div className="audio-editor">
                  <div className="form-group">
                    <label>讲解词（{SUPPORTED_LANGUAGES.find((l) => l.code === activeLanguage)?.name}）</label>
                    <textarea
                      placeholder="请输入讲解词内容，可配合音频文件使用"
                      value={currentExhibit.standardAudio[activeLanguage]?.text || ''}
                      onChange={(e) =>
                        updateExhibitAudio(
                          currentExhibition.id,
                          currentExhibit.id,
                          'standardAudio',
                          activeLanguage,
                          { text: e.target.value }
                        )
                      }
                      rows={8}
                    />
                  </div>
                  <div className="form-group">
                    <label>音频文件</label>
                    {currentExhibit.standardAudio[activeLanguage]?.audioPath ? (
                      <div className="audio-file">
                        <span>🎵 {currentExhibit.standardAudio[activeLanguage].audioPath}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <audio
                            controls
                            src={`file:///${currentExhibit.standardAudio[activeLanguage].audioPath}`}
                          />
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              updateExhibitAudio(
                                currentExhibition.id,
                                currentExhibit.id,
                                'standardAudio',
                                activeLanguage,
                                { audioPath: undefined }
                              )
                            }
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleSelectAudio('standardAudio')}
                      >
                        🎵 选择音频文件
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'child' && (
                <div className="audio-editor">
                  <div className="form-group">
                    <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!currentExhibit.childAudio}
                        onChange={(e) =>
                          toggleChildAudio(currentExhibition.id, currentExhibit.id, e.target.checked)
                        }
                      />
                      <span>启用儿童版讲解</span>
                    </label>
                  </div>
                  {currentExhibit.childAudio && (
                    <>
                      <div className="form-group">
                        <label>
                          儿童讲解词（{SUPPORTED_LANGUAGES.find((l) => l.code === activeLanguage)?.name}）
                        </label>
                        <textarea
                          placeholder="请输入适合儿童的讲解词，语言更生动有趣"
                          value={currentExhibit.childAudio[activeLanguage]?.text || ''}
                          onChange={(e) =>
                            updateExhibitAudio(
                              currentExhibition.id,
                              currentExhibit.id,
                              'childAudio',
                              activeLanguage,
                              { text: e.target.value }
                            )
                          }
                          rows={8}
                        />
                      </div>
                      <div className="form-group">
                        <label>音频文件</label>
                        {currentExhibit.childAudio[activeLanguage]?.audioPath ? (
                          <div className="audio-file">
                            <span>🎵 {currentExhibit.childAudio[activeLanguage].audioPath}</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <audio
                                controls
                                src={`file:///${currentExhibit.childAudio[activeLanguage].audioPath}`}
                              />
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  updateExhibitAudio(
                                    currentExhibition.id,
                                    currentExhibit.id,
                                    'childAudio',
                                    activeLanguage,
                                    { audioPath: undefined }
                                  )
                                }
                              >
                                移除
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleSelectAudio('childAudio')}
                          >
                            🎵 选择音频文件
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'extended' && (
                <div className="extended-stories">
                  <div className="stories-header">
                    <p className="text-muted">为重点展品添加延伸故事，让游客了解更多背景</p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => addExtendedStory(currentExhibition.id, currentExhibit.id)}
                    >
                      ➕ 添加故事
                    </button>
                  </div>
                  {(!currentExhibit.extendedStories || currentExhibit.extendedStories.length === 0) ? (
                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                      <div className="empty-state-icon">📖</div>
                      <div className="empty-state-text">暂无延伸故事，点击上方按钮添加</div>
                    </div>
                  ) : (
                    <div className="stories-list">
                      {currentExhibit.extendedStories.map((story, index) => (
                        <div key={story.id} className="story-card">
                          <div className="story-header">
                            <h4>故事 #{index + 1}</h4>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                deleteExtendedStory(
                                  currentExhibition.id,
                                  currentExhibit.id,
                                  story.id
                                )
                              }
                            >
                              删除
                            </button>
                          </div>
                          <div className="form-group">
                            <label>故事标题</label>
                            <input
                              type="text"
                              placeholder="故事标题"
                              value={story.title}
                              onChange={(e) =>
                                updateExtendedStory(
                                  currentExhibition.id,
                                  currentExhibit.id,
                                  story.id,
                                  { title: e.target.value }
                                )
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>故事内容</label>
                            <textarea
                              placeholder="请输入延伸故事内容"
                              value={story.content}
                              onChange={(e) =>
                                updateExtendedStory(
                                  currentExhibition.id,
                                  currentExhibit.id,
                                  story.id,
                                  { content: e.target.value }
                                )
                              }
                              rows={4}
                            />
                          </div>
                          <div className="form-group">
                            <label>
                              故事音频（
                              {SUPPORTED_LANGUAGES.find((l) => l.code === activeLanguage)?.name}）
                            </label>
                            {story.audio?.[activeLanguage]?.audioPath ? (
                              <div className="audio-file">
                                <span>🎵 {story.audio[activeLanguage].audioPath}</span>
                                <audio
                                  controls
                                  src={`file:///${story.audio[activeLanguage].audioPath}`}
                                />
                              </div>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleStoryAudio(story.id)}
                              >
                                🎵 选择音频
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default ExhibitPanel;
