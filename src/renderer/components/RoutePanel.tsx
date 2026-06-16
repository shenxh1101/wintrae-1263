import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../store/useAppStore';
import { RouteItem, Exhibit } from '@shared/types';
import { formatDuration } from '@shared/utils';
import '../styles/route.css';

interface SortableItemProps {
  routeItem: RouteItem;
  exhibit: Exhibit | undefined;
  halls: string[];
  onHallChange: (hall: string) => void;
  onRemove: () => void;
}

function SortableItem({ routeItem, exhibit, halls, onHallChange, onRemove }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: routeItem.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`route-item ${exhibit?.isHighlight ? 'highlight' : ''}`}
    >
      <div className="drag-handle" {...attributes} {...listeners}>
        ⠿
      </div>
      <div className="route-item-index">{routeItem.order + 1}</div>
      {exhibit?.coverImage ? (
        <img src={exhibit.coverImage} alt="" className="route-item-thumb" />
      ) : (
        <div className="route-item-thumb placeholder">🖼️</div>
      )}
      <div className="route-item-info">
        <div className="route-item-title">
          {exhibit?.title || '未知展品'}
          {exhibit?.isHighlight && <span className="star-icon">⭐</span>}
        </div>
        <div className="route-item-meta">
          <span className="exhibit-code">{exhibit?.code}</span>
          <span>⏱️ {formatDuration(exhibit?.suggestedDuration || 0)}</span>
        </div>
      </div>
      <select
        className="hall-select input-sm"
        value={routeItem.hall}
        onChange={(e) => onHallChange(e.target.value)}
      >
        {halls.map((hall) => (
          <option key={hall} value={hall}>
            {hall}
          </option>
        ))}
      </select>
      <button className="remove-btn" onClick={onRemove} title="从路线中移除">
        ✕
      </button>
    </div>
  );
}

function RoutePanel() {
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const addRouteItem = useAppStore((state) => state.addRouteItem);
  const removeRouteItem = useAppStore((state) => state.removeRouteItem);
  const reorderRoute = useAppStore((state) => state.reorderRoute);
  const updateRouteItemHall = useAppStore((state) => state.updateRouteItemHall);
  const updateExhibition = useAppStore((state) => state.updateExhibition);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHallModal, setShowHallModal] = useState(false);
  const [newHallName, setNewHallName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const getExhibit = (exhibitId: string) =>
    currentExhibition.exhibits.find((ex) => ex.id === exhibitId);

  const unassignedExhibits = currentExhibition.exhibits.filter(
    (ex) => !currentExhibition.route.some((r) => r.exhibitId === ex.id)
  );

  const totalDuration = sortedRoute.reduce(
    (sum, r) => sum + (getExhibit(r.exhibitId)?.suggestedDuration || 0),
    0
  );

  const groupedByHall = useMemo(() => {
    const groups: { [key: string]: RouteItem[] } = {};
    sortedRoute.forEach((item) => {
      if (!groups[item.hall]) {
        groups[item.hall] = [];
      }
      groups[item.hall].push(item);
    });
    return groups;
  }, [sortedRoute]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = sortedRoute.findIndex((item) => item.id === active.id);
      const newIndex = sortedRoute.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(sortedRoute, oldIndex, newIndex);
      reorderRoute(currentExhibition.id, newItems);
    }
  };

  const handleAddHall = () => {
    if (!newHallName.trim()) return;
    updateExhibition(currentExhibition.id, {
      halls: [...currentExhibition.halls, newHallName.trim()],
    });
    setNewHallName('');
    setShowHallModal(false);
  };

  const handleRemoveHall = (hall: string) => {
    if (currentExhibition.halls.length <= 1) {
      alert('至少需要保留一个展厅');
      return;
    }
    const remainingHalls = currentExhibition.halls.filter((h) => h !== hall);
    const updatedRoute = currentExhibition.route.map((r) =>
      r.hall === hall ? { ...r, hall: remainingHalls[0] } : r
    );
    updateExhibition(currentExhibition.id, {
      halls: remainingHalls,
      route: updatedRoute,
    });
  };

  const activeRouteItem = activeId ? sortedRoute.find((r) => r.id === activeId) : null;
  const activeExhibit = activeRouteItem ? getExhibit(activeRouteItem.exhibitId) : null;

  return (
    <div className="route-panel">
      <div className="route-header">
        <div>
          <h2>参观路线编排</h2>
          <p className="text-muted">
            共 {sortedRoute.length} 件展品 · 预计总时长 {formatDuration(totalDuration)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHallModal(true)}>
            🏛️ 管理展厅
          </button>
        </div>
      </div>

      <div className="route-layout">
        <div className="route-main">
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <h2>参观顺序</h2>
              <span className="text-muted">拖拽展品调整顺序</span>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', height: 'calc(100% - 60px)' }}>
              {sortedRoute.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🗺️</div>
                  <div className="empty-state-text">
                    从右侧"未分配展品"中拖拽展品到此处开始编排路线
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortedRoute.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {Object.entries(groupedByHall).map(([hall, items]) => (
                      <div key={hall} className="hall-group">
                        <div className="hall-group-header">
                          <span className="hall-name">🏛️ {hall}</span>
                          <span className="hall-count">{items.length} 件展品</span>
                        </div>
                        <div className="hall-items">
                          {items.map((routeItem) => (
                            <SortableItem
                              key={routeItem.id}
                              routeItem={routeItem}
                              exhibit={getExhibit(routeItem.exhibitId)}
                              halls={currentExhibition.halls}
                              onHallChange={(newHall) =>
                                updateRouteItemHall(currentExhibition.id, routeItem.id, newHall)
                              }
                              onRemove={() =>
                                removeRouteItem(currentExhibition.id, routeItem.id)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activeRouteItem && (
                      <div className="route-item dragging">
                        <div className="drag-handle">⠿</div>
                        <div className="route-item-index">{activeRouteItem.order + 1}</div>
                        {activeExhibit?.coverImage ? (
                          <img
                            src={activeExhibit.coverImage}
                            alt=""
                            className="route-item-thumb"
                          />
                        ) : (
                          <div className="route-item-thumb placeholder">🖼️</div>
                        )}
                        <div className="route-item-info">
                          <div className="route-item-title">
                            {activeExhibit?.title || '未知展品'}
                          </div>
                          <div className="route-item-meta">
                            <span className="exhibit-code">{activeExhibit?.code}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        <aside className="route-sidebar">
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <h2>未分配展品</h2>
              <span className="badge badge-primary">{unassignedExhibits.length}</span>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', height: 'calc(100% - 60px)' }}>
              {unassignedExhibits.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <div className="empty-state-icon">✅</div>
                  <div className="empty-state-text">所有展品已分配到路线</div>
                </div>
              ) : (
                <div className="unassigned-list">
                  {unassignedExhibits.map((exhibit) => (
                    <div key={exhibit.id} className="unassigned-item">
                      {exhibit.coverImage ? (
                        <img src={exhibit.coverImage} alt="" className="exhibit-thumb" />
                      ) : (
                        <div className="exhibit-thumb placeholder">🖼️</div>
                      )}
                      <div className="unassigned-info">
                        <div className="exhibit-title">
                          {exhibit.title || '未命名展品'}
                          {exhibit.isHighlight && <span className="star-icon">⭐</span>}
                        </div>
                        <div className="exhibit-code">{exhibit.code}</div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          addRouteItem(
                            currentExhibition.id,
                            exhibit.id,
                            currentExhibition.halls[0]
                          )
                        }
                      >
                        添加
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {showHallModal && (
        <div className="modal-overlay" onClick={() => setShowHallModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>展厅管理</h3>
              <button className="modal-close" onClick={() => setShowHallModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>当前展厅</label>
                <div className="hall-list">
                  {currentExhibition.halls.map((hall) => (
                    <div key={hall} className="hall-tag">
                      <span>{hall}</span>
                      <button
                        className="tag-remove"
                        onClick={() => handleRemoveHall(hall)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>添加新展厅</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="展厅名称"
                    value={newHallName}
                    onChange={(e) => setNewHallName(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAddHall}
                    disabled={!newHallName.trim()}
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowHallModal(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoutePanel;
