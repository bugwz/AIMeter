import React, { useCallback, useEffect, useRef, useState } from 'react';
import { credentialService } from '../../services/CredentialService';
import { apiService } from '../../services/ApiService';
import { ProviderCard } from '../common/ProviderCard';
import { ProviderModal } from '../common/ProviderModal';
import { PageLoader } from '../common/LoadingSpinner';
import { resolveProviderWebsite } from '../common/providerLinks';
import { getRuntimeEntry } from '../../runtimeContext';
import { UsageError, UsageErrorCode, ProviderConfig, DashboardProviderData, RuntimeCapabilities } from '../../types';

interface ProviderData extends DashboardProviderData {
  id: string;
}

type DashboardItem = ProviderData | UsageError;
type StorageMode = RuntimeCapabilities['storageMode'];

interface DragState {
  pointerId: number;
  draggedId: string;
  currentOrder: string[];
  overId: string | null;
  placement: 'before' | 'after';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  sourceWidth: number;
  sourceHeight: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
}

const DASHBOARD_ORDER_KEY = 'aimeter_dashboard_order';

function toDate(value: Date | string | number | null | undefined): Date {
  if (typeof value === 'number') {
    const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestampMs);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }
  const parsed = value instanceof Date ? value : value ? new Date(value) : new Date(0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function toOptionalDate(value: Date | string | number | null | undefined): Date | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') {
    const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestampMs);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getItemId(item: DashboardItem): string | undefined {
  return 'id' in item && typeof item.id === 'string' ? item.id : undefined;
}

function loadLocalDashboardOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  } catch (error) {
    console.error('Failed to load dashboard order:', error);
    return [];
  }
}

function saveLocalDashboardOrder(ids: string[]): void {
  try {
    window.localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save dashboard order:', error);
  }
}

function orderItemsByIds(items: DashboardItem[], orderedIds: string[]): DashboardItem[] {
  const itemMap = new Map<string, DashboardItem>();
  const idlessItems: DashboardItem[] = [];

  items.forEach((item) => {
    const id = getItemId(item);
    if (!id) {
      idlessItems.push(item);
      return;
    }
    itemMap.set(id, item);
  });

  const orderedItems = orderedIds
    .map((id) => itemMap.get(id))
    .filter((item): item is DashboardItem => Boolean(item));
  const remainingItems = items.filter((item) => {
    const id = getItemId(item);
    return id ? !orderedIds.includes(id) : false;
  });

  return [...orderedItems, ...remainingItems, ...idlessItems];
}

function normalizeLocalOrder(items: DashboardItem[], storedIds: string[]): { items: DashboardItem[]; ids: string[] } {
  const currentIds = items
    .map(getItemId)
    .filter((id): id is string => Boolean(id));
  const validStoredIds = storedIds.filter((id, index) => currentIds.includes(id) && storedIds.indexOf(id) === index);
  const missingIds = currentIds.filter((id) => !validStoredIds.includes(id));
  const normalizedIds = [...validStoredIds, ...missingIds];

  return {
    items: orderItemsByIds(items, normalizedIds),
    ids: normalizedIds,
  };
}

function moveId(ids: string[], draggedId: string, targetId: string, placement: 'before' | 'after'): string[] {
  if (draggedId === targetId) {
    return ids;
  }
  const next = [...ids];
  const fromIndex = next.indexOf(draggedId);
  const toIndex = next.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return ids;

  next.splice(fromIndex, 1);
  const targetIndexAfterRemoval = next.indexOf(targetId);
  const insertionIndex = placement === 'after' ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  next.splice(insertionIndex, 0, draggedId);
  return next;
}

function areIdListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizeUsagePayload(items: (ProviderData | UsageError)[]): DashboardItem[] {
  return items.map((data) => {
    if ('progress' in data && Array.isArray(data.progress)) {
      return {
        ...data,
        name: data.name,
        updatedAt: toDate(data.updatedAt),
        progress: data.progress.map((item) => ({
          ...item,
          resetsAt: toOptionalDate(item.resetsAt),
        })),
      } as ProviderData;
    }

    return data as UsageError;
  });
}

export const Dashboard: React.FC = () => {
  const [usages, setUsages] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingProviderIds, setRefreshingProviderIds] = useState<Set<string>>(new Set());
  const [savingOrder, setSavingOrder] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<(ProviderConfig & { id?: string }) | undefined>();
  const [editingProgressItems, setEditingProgressItems] = useState<string[]>([]);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; provider: string; name?: string } | null>(null);
  const [removingProvider, setRemovingProvider] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const capabilitiesRef = useRef<RuntimeCapabilities | null>(null);
  const dragStartOrderRef = useRef<string[]>([]);
  const usagesRef = useRef<DashboardItem[]>([]);
  const runtimeRole = getRuntimeEntry().role;
  const canCreate = capabilities ? capabilities.ui.allowProviderCreate : runtimeRole === 'admin';
  const canEdit = capabilities ? capabilities.ui.allowProviderEdit : runtimeRole === 'admin';
  const canDelete = capabilities ? capabilities.ui.allowProviderDelete : runtimeRole === 'admin';
  const canReorder = capabilities ? capabilities.ui.allowProviderReorder : runtimeRole === 'admin';
  const canRefresh = capabilities ? capabilities.ui.allowManualRefresh : runtimeRole === 'admin';

  useEffect(() => {
    usagesRef.current = usages;
  }, [usages]);

  const applyDisplayOrdering = useCallback((items: DashboardItem[], mode?: StorageMode): DashboardItem[] => {
    const resolvedMode = mode || capabilitiesRef.current?.storageMode;
    if (resolvedMode !== 'env') {
      return items;
    }

    const ordered = normalizeLocalOrder(items, loadLocalDashboardOrder());
    saveLocalDashboardOrder(ordered.ids);
    return ordered.items;
  }, []);

  const loadCapabilities = useCallback(async () => {
    try {
      const nextCapabilities = await apiService.getCapabilities();
      capabilitiesRef.current = nextCapabilities;
      setCapabilities(nextCapabilities);
      setUsages((prev) => applyDisplayOrdering(prev, nextCapabilities.storageMode));
    } catch (error) {
      console.error('Failed to load runtime capabilities:', error);
    }
  }, [applyDisplayOrdering]);

  const fetchAllUsage = useCallback(async () => {
    setLoading(true);
    try {
      const latestData = await apiService.fetchLatest();
      const normalized = normalizeUsagePayload(latestData);
      setUsages(applyDisplayOrdering(normalized));
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  }, [applyDisplayOrdering]);

  useEffect(() => {
    void fetchAllUsage();
    void loadCapabilities();
  }, [fetchAllUsage, loadCapabilities]);

  const persistOrder = useCallback(async (ids: string[], previousOrder: string[]) => {
    const storageMode = capabilitiesRef.current?.storageMode;
    if (!ids.length) return;

    if (storageMode === 'env') {
      saveLocalDashboardOrder(ids);
      return;
    }

    if (storageMode !== 'database') {
      return;
    }

    setSavingOrder(true);
    try {
      await apiService.updateProviderOrder(ids);
    } catch (error) {
      console.error('Failed to persist provider order:', error);
      setUsages((prev) => orderItemsByIds(prev, previousOrder));
      window.alert(error instanceof Error ? error.message : 'Failed to save dashboard order');
    } finally {
      setSavingOrder(false);
    }
  }, []);

  useEffect(() => {
    if (!dragState) return undefined;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const handlePointerMove = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }

        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        const hoveredCard = hoveredElement?.closest('[data-provider-id]');
        const targetId = hoveredCard?.getAttribute('data-provider-id');

        if (!targetId || targetId === current.draggedId) {
          if (current.overId === targetId || (!targetId && current.overId === null)) {
            if (current.currentX === event.clientX && current.currentY === event.clientY) {
              return current;
            }
            return {
              ...current,
              currentX: event.clientX,
              currentY: event.clientY,
            };
          }
          return {
            ...current,
            overId: targetId || null,
            currentX: event.clientX,
            currentY: event.clientY,
          };
        }

        if (!hoveredCard) {
          if (current.currentX === event.clientX && current.currentY === event.clientY) {
            return current;
          }
          return {
            ...current,
            currentX: event.clientX,
            currentY: event.clientY,
          };
        }

        const rect = hoveredCard.getBoundingClientRect();
        const placement = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
        const nextOrder = moveId(current.currentOrder, current.draggedId, targetId, placement);
        if (areIdListsEqual(nextOrder, current.currentOrder)) {
          return {
            ...current,
            overId: targetId,
            placement,
            currentX: event.clientX,
            currentY: event.clientY,
          };
        }

        setUsages((prev) => orderItemsByIds(prev, nextOrder));
        return {
          ...current,
          currentOrder: nextOrder,
          overId: targetId,
          placement,
          currentX: event.clientX,
          currentY: event.clientY,
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const latestVisualOrder = usagesRef.current
        .map(getItemId)
        .filter((itemId): itemId is string => Boolean(itemId));
      const shouldPersist = !areIdListsEqual(dragStartOrderRef.current, latestVisualOrder);
      setDragState(null);

      if (shouldPersist && latestVisualOrder.length > 0) {
        void persistOrder(latestVisualOrder, dragStartOrderRef.current);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState, persistOrder]);

  const handleRefresh = async () => {
    if (!canRefresh) return;
    setRefreshing(true);
    try {
      const refreshData = await apiService.fetchRefresh();
      const normalized = normalizeUsagePayload(refreshData);
      setUsages(applyDisplayOrdering(normalized));
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshProvider = async (id: string) => {
    if (!canRefresh) return;
    setRefreshingProviderIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const snapshot = await apiService.refreshProvider(id);
      setUsages((prev) =>
        prev.map((item) => {
          if (item.id !== id) {
            return item;
          }
          const previousProviderData = 'progress' in item ? item : null;
          const snapshotExtra = snapshot as unknown as Record<string, unknown>;
          return {
            id,
            provider: snapshot.provider,
            name: previousProviderData?.name,
            region: previousProviderData?.region,
            progress: snapshot.progress,
            cost: snapshot.cost,
            identity: snapshot.identity,
            updatedAt: snapshot.updatedAt,
            stale: snapshotExtra.stale as boolean | undefined,
            staleAt: (() => {
              const s = snapshotExtra.staleAt;
              if (!s) return undefined;
              return typeof s === 'number' ? new Date(s * 1000) : undefined;
            })(),
            fromCache: snapshotExtra.fromCache as boolean | undefined,
            authRequired: snapshotExtra.authRequired as boolean | undefined,
            refreshInterval: typeof snapshotExtra.refreshInterval === 'number' ? snapshotExtra.refreshInterval : previousProviderData && 'refreshInterval' in previousProviderData ? (previousProviderData as unknown as Record<string, unknown>).refreshInterval as number | undefined : undefined,
          };
        }),
      );
    } catch (error) {
      console.error(`Failed to refresh provider ${id}:`, error);
      const message = error instanceof Error ? error.message : 'Failed to refresh provider';
      setUsages((prev) =>
        prev.map((item) => {
          if (item.id !== id) {
            return item;
          }
          return {
            id,
            provider: item.provider,
            code: UsageErrorCode.API_ERROR,
            message,
            timestamp: new Date(),
          };
        }),
      );
    } finally {
      setRefreshingProviderIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;

    setRemovingProvider(true);
    try {
      await credentialService.deleteConfig(pendingRemove.id);
      setUsages((prev) => prev.filter((item) => getItemId(item) !== pendingRemove.id));
      setPendingRemove(null);
    } catch (error) {
      console.error('Failed to remove provider:', error);
      window.alert(error instanceof Error ? error.message : 'Failed to remove provider');
    } finally {
      setRemovingProvider(false);
    }
  };

  const requestRemoveProvider = (id: string, provider: string, name?: string) => {
    setPendingRemove({ id, provider, name });
  };

  const handleAddProvider = () => {
    if (!canCreate) return;
    setEditingConfig(undefined);
    setModalOpen(true);
  };

  const handleEditProvider = (id: string) => {
    if (!canEdit) return;
    const currentUsage = usagesRef.current.find(u => 'progress' in u && (u as ProviderData).id === id) as ProviderData | undefined;
    const availableProgressItems = currentUsage?.progress?.map((p) => p.name) || [];
    setEditingProgressItems(availableProgressItems);
    credentialService.getConfigWithCredentials(id)
      .then((config) => {
        if (!config) {
          window.alert('Failed to load provider details');
          return;
        }
        setEditingConfig(config);
        setModalOpen(true);
      })
      .catch((error) => {
        console.error('Failed to load provider config:', error);
        window.alert(error instanceof Error ? error.message : 'Failed to load provider details');
      });
  };

  const handleModalSuccess = async () => {
    await fetchAllUsage();
  };

  const handleDragStart = (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (savingOrder || refreshing || dragState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const sourceCard = event.currentTarget.closest('[data-provider-id]') as HTMLElement | null;
    if (!sourceCard) {
      return;
    }
    const sourceRect = sourceCard.getBoundingClientRect();
    dragStartOrderRef.current = usages
      .map(getItemId)
      .filter((itemId): itemId is string => Boolean(itemId));

    setDragState({
      pointerId: event.pointerId,
      draggedId: id,
      currentOrder: dragStartOrderRef.current,
      overId: id,
      placement: 'before',
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      sourceWidth: sourceRect.width,
      sourceHeight: sourceRect.height,
      pointerOffsetX: event.clientX - sourceRect.left,
      pointerOffsetY: event.clientY - sourceRect.top,
    });
  };

  if (loading && usages.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-in">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Monitor your AI provider quotas
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
          {canCreate && (
          <button
            onClick={handleAddProvider}
            className="btn-primary h-10 w-full justify-center px-3 sm:h-auto sm:w-auto sm:px-5"
            disabled={!canCreate}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            {!canCreate ? (
              <>
                <span className="sm:hidden">Env</span>
                <span className="hidden sm:inline">Env Managed</span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add Provider</span>
              </>
            )}
          </button>
          )}

          {canRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing || savingOrder || Boolean(dragState)}
            className="btn-primary h-10 w-full cursor-pointer justify-center px-3 sm:h-auto sm:w-auto sm:px-5"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
            </svg>
            {savingOrder ? (
              <>
                <span className="sm:hidden">Saving</span>
                <span className="hidden sm:inline">Saving Order</span>
              </>
            ) : (
              <span>Refresh</span>
            )}
          </button>
          )}
        </div>
      </div>

      {usages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--color-text-primary)] mb-1">
            No providers configured
          </h2>
          <p className="text-sm text-[var(--color-text-tertiary)] text-center max-w-sm mb-6">
            Add your AI provider credentials to start tracking usage.
          </p>
          {canCreate && (
          <button onClick={handleAddProvider} className="btn-primary" disabled={!canCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>{!canCreate ? 'Providers Are Managed By Env' : 'Add Your First Provider'}</span>
          </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {usages.map((data, index) => {
            const id = getItemId(data);
            const isError = 'code' in data;
            const displayName = !isError && 'name' in data ? data.name : undefined;
            const region = !isError && 'region' in data ? data.region : undefined;
            const provider = data.provider;
            const logoUrl = resolveProviderWebsite(provider, region);
            const cardKey = id !== undefined ? `${provider}-${id}` : `${provider}-${index}`;
            const dragDisabled = savingOrder || refreshing || !capabilities || !canReorder;
            const isDraggedCard = Boolean(id && dragState?.draggedId === id);
            const providerData = !isError ? (data as ProviderData) : undefined;

            return (
              <div
                key={cardKey}
                data-provider-id={id}
                className={`relative h-full transition-transform duration-200 ease-out ${
                  isDraggedCard ? 'z-20' : 'z-0'
                }`}
                style={{
                  transition: isDraggedCard
                    ? 'none'
                    : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {isDraggedCard && dragState ? (
                  <div
                    className="h-full rounded-xl border border-dashed border-emerald-400/30 bg-emerald-400/6"
                    style={{
                      minHeight: `${dragState.sourceHeight}px`,
                      boxShadow: 'inset 0 0 0 1px rgba(16,185,129,0.08)',
                    }}
                  />
                ) : (
                  <ProviderCard
                    provider={provider}
                    usage={data}
                    logoUrl={logoUrl}
                    displayName={displayName}
                    onRemove={id !== undefined && canDelete ? () => requestRemoveProvider(id, provider, displayName) : undefined}
                    onEdit={id !== undefined && canEdit ? () => handleEditProvider(id) : undefined}
                    onRefresh={id !== undefined && canRefresh ? () => handleRefreshProvider(id) : undefined}
                    refreshLoading={Boolean(id && refreshingProviderIds.has(id))}
                    delay={index * 50}
                    dragDisabled={dragDisabled || !id}
                    dragHandleProps={id ? { onPointerDown: (event) => handleDragStart(id, event) } : undefined}
                    isDragging={false}
                    isDropTarget={Boolean(id && dragState?.overId === id && dragState.draggedId !== id)}
                    dropIndicator={id && dragState?.overId === id && dragState.draggedId !== id ? dragState.placement : null}
                    refreshInterval={providerData?.refreshInterval}
                    staleAt={providerData?.staleAt}
                    authRequired={providerData?.authRequired}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {dragState && (() => {
        const draggedItem = usages.find((item) => getItemId(item) === dragState.draggedId);
        if (!draggedItem) return null;

        const isError = 'code' in draggedItem;
        const displayName = !isError && 'name' in draggedItem ? draggedItem.name : undefined;
        const region = !isError && 'region' in draggedItem ? draggedItem.region : undefined;
        const logoUrl = resolveProviderWebsite(draggedItem.provider, region);
        return (
          <div
            className="pointer-events-none fixed z-50"
            style={{
              left: `${dragState.currentX - dragState.pointerOffsetX}px`,
              top: `${dragState.currentY - dragState.pointerOffsetY}px`,
              width: `${dragState.sourceWidth}px`,
            }}
          >
            <ProviderCard
              provider={draggedItem.provider}
              usage={draggedItem}
              logoUrl={logoUrl}
              displayName={displayName}
              delay={0}
              dragDisabled
              isDragging
              isDropTarget={false}
              dropIndicator={null}
            />
          </div>
        );
      })()}

      <ProviderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleModalSuccess}
        editConfig={editingConfig}
        availableProgressItems={editingProgressItems}
      />

      {pendingRemove && canDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => !removingProvider && setPendingRemove(null)}
            aria-label="Close delete confirmation"
          />
          <div
            className="relative w-full max-w-md rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-6 shadow-2xl animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-provider-title"
          >
            <h3 id="delete-provider-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
              Confirm Delete Provider
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
              This will remove{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {pendingRemove.name ? `${pendingRemove.provider} - ${pendingRemove.name}` : pendingRemove.provider}
              </span>{' '}
              from the dashboard configuration.
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">This action cannot be undone.</p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingRemove(null)}
                disabled={removingProvider}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removingProvider}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--color-error)] hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {removingProvider ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
