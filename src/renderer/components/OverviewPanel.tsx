import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { formatDuration } from '@shared/utils';
import '../styles/overview.css';

function OverviewPanel() {
  const exhibitions = useAppStore((state) => state.exhibitions);
  const currentExhibitionId = useAppStore((state) => state.currentExhibitionId);
  const setCurrentExhibition = useAppStore((state) => state.setCurrentExhibition);
  const setCurrentWindow = useAppStore((state) => state.setCurrentWindow);
  const addExhibition = useAppStore((state) => state.addExhibition);
  const deleteExhibition = useAppStore((state) => state.deleteExhibition);
  const duplicateExhibition = useAppStore((state) => state.duplicateExhibition);

  const [showNewModal, setShowNewModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const handleSelectExhibition = (id: string) => {
    setCurrentExhibition(id);
    setCurrentWindow('exhibit');
  };

  const handleCreateExhibition = () => {
    if (!newName.trim()) return;
    addExhibition(newName.trim(), newDescription.trim());
    setNewName('');
    setNewDescription('');
    setShowNewModal(false);
  };

  const handleOpenCopyModal = (id: string) => {
    setCopySourceId(id);
    const source = exhibitions.find((ex) => ex.id === id);
    setNewName(source ? `${source.name} 副本` : '');
    setShowCopyModal(true);
  };

  const handleCopyExhibition = () => {
    if (!copySourceId || !newName.trim()) return;
    duplicateExhibition(copySourceId, newName.trim());
    setNewName('');
    setCopySourceId(null);
    setShowCopyModal(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTotalDuration = (exhibition: typeof exhibitions[0]) => {
    return exhibition.exhibits.reduce((total, ex) => total + ex.suggestedDuration, 0);
  };

  return (
    <div className="overview-panel">
      <div className="overview-header">
        <div>
          <h2 className="overview-title">展览管理</h2>
          <p className="overview-subtitle">创建和管理您的所有展览项目</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowNewModal(true)}>
          <span>➕</span>
          <span>创建新展览</span>
        </button>
      </div>

      {exhibitions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏛️</div>
          <div className="empty-state-text">还没有任何展览，点击上方按钮创建第一个展览吧！</div>
        </div>
      ) : (
        <div className="exhibition-grid">
          {exhibitions.map((exhibition) => (
            <div
              key={exhibition.id}
              className={`exhibition-card ${
                currentExhibitionId === exhibition.id ? 'selected' : ''
              }`}
              onClick={() => handleSelectExhibition(exhibition.id)}
            >
              <div className="exhibition-card-header">
                <div className="exhibition-icon">🎨</div>
                <h3 className="exhibition-name">{exhibition.name}</h3>
              </div>

              {exhibition.description && (
                <p className="exhibition-description">{exhibition.description}</p>
              )}

              <div className="exhibition-stats">
                <div className="stat">
                  <span className="stat-icon">🖼️</span>
                  <span className="stat-value">{exhibition.exhibits.length}</span>
                  <span className="stat-label">展品</span>
                </div>
                <div className="stat">
                  <span className="stat-icon">📍</span>
                  <span className="stat-value">{exhibition.route.length}</span>
                  <span className="stat-label">路线节点</span>
                </div>
                <div className="stat">
                  <span className="stat-icon">⏱️</span>
                  <span className="stat-value">{formatDuration(getTotalDuration(exhibition))}</span>
                  <span className="stat-label">预计时长</span>
                </div>
              </div>

              <div className="exhibition-meta">
                <span className="text-muted">更新于 {formatDate(exhibition.updatedAt)}</span>
              </div>

              <div className="exhibition-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenCopyModal(exhibition.id)}
                >
                  📋 复制
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (confirm(`确定要删除展览"${exhibition.name}"吗？此操作不可恢复。`)) {
                      deleteExhibition(exhibition.id);
                    }
                  }}
                >
                  🗑️ 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建新展览</h3>
              <button className="modal-close" onClick={() => setShowNewModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>展览名称 *</label>
                <input
                  type="text"
                  placeholder="请输入展览名称"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>展览简介</label>
                <textarea
                  placeholder="请输入展览简介（可选）"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateExhibition}
                disabled={!newName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>复制展览为新模板</h3>
              <button className="modal-close" onClick={() => setShowCopyModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>新展览名称 *</label>
                <input
                  type="text"
                  placeholder="请输入新展览名称"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-muted" style={{ marginTop: 8 }}>
                将复制原展览的所有展品、路线设置，作为新展览的模板。
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCopyModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCopyExhibition}
                disabled={!newName.trim()}
              >
                复制
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OverviewPanel;
