/**
 * ModesAdvancedEditor
 *
 * Full table editor for power users.
 * Allows adding/editing/deleting any mode with live RC feedback.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import { MODE_INFO, AUX_CHANNELS, ALL_MODES } from './presets/mode-presets';
import ModeCard from './shared/ModeCard';
import RangeSlider from './shared/RangeSlider';
import AuxChannelPicker from './shared/AuxChannelPicker';
import { Plus, RotateCcw, RefreshCw, X, Radio, HelpCircle } from 'lucide-react';

interface AddModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (boxId: number) => void;
  existingModes: number[];
}

const AddModeModal: React.FC<AddModeModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingModes,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filteredModes = ALL_MODES.filter(
    (m) =>
      !existingModes.includes(m.boxId) &&
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-solid rounded-xl border border shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-subtle flex items-center justify-between">
          <h3 className="font-semibold text-content">{t('modes:modesAdvancedEditor.addMode')}</h3>
          <button
            onClick={onClose}
            className="p-1 text-content-secondary hover:text-content rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-subtle">
          <input
            type="text"
            placeholder={t('modes:modesAdvancedEditor.searchModes')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        {/* Mode list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredModes.length === 0 ? (
            <div className="text-center py-8 text-content-secondary text-sm">
              {existingModes.length > 0 ? t('modes:modesAdvancedEditor.noMoreModes') : t('modes:modesAdvancedEditor.noModesFound')}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredModes.map((mode) => {
                const IconComponent = mode.icon;
                return (
                  <button
                    key={mode.boxId}
                    onClick={() => {
                      onAdd(mode.boxId);
                      onClose();
                    }}
                    className="w-full px-3 py-3 text-left hover:bg-surface-raised rounded-lg transition-colors flex items-center gap-3"
                  >
                    <div className={`w-8 h-8 rounded-lg ${mode.color}/20 flex items-center justify-center`}>
                      <IconComponent className={`w-4 h-4 ${mode.color.replace('bg-', 'text-')}`} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-content">{mode.name}</div>
                      <div className="text-xs text-content-secondary">{t(mode.descriptionKey)}</div>
                    </div>
                    {mode.essential && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                        {t('modes:modesAdvancedEditor.essential')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface EditModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: { boxId: number; auxChannel: number; rangeStart: number; rangeEnd: number } | null;
  rcChannels: number[];
  onSave: (auxChannel: number, rangeStart: number, rangeEnd: number) => void;
  dynamicName?: string;
}

const EditModeModal: React.FC<EditModeModalProps> = ({
  isOpen,
  onClose,
  mode,
  rcChannels,
  onSave,
  dynamicName,
}) => {
  const { t } = useTranslation();
  const [auxChannel, setAuxChannel] = useState(0);
  const [rangeStart, setRangeStart] = useState(1800);
  const [rangeEnd, setRangeEnd] = useState(2100);

  useEffect(() => {
    if (mode) {
      setAuxChannel(mode.auxChannel);
      setRangeStart(mode.rangeStart);
      setRangeEnd(mode.rangeEnd);
    }
  }, [mode]);

  if (!isOpen || !mode) return null;

  const info = MODE_INFO[mode.boxId];
  const IconComponent = info?.icon || HelpCircle;
  const rcValue = rcChannels[auxChannel + 4] || 1500;
  // Use dynamic name from FC if provided, fallback to preset name or boxId
  const displayName = dynamicName || info?.name || t('modes:modeFallback', { id: mode.boxId });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-solid rounded-xl border border shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-4 py-3 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${info?.color || 'bg-zinc-500'}/20 flex items-center justify-center`}>
              <IconComponent className={`w-4 h-4 ${(info?.color || 'bg-zinc-500').replace('bg-', 'text-')}`} />
            </div>
            <h3 className="font-semibold text-content">{displayName}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-content-secondary hover:text-content rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Channel picker */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-content">{t('modes:modesAdvancedEditor.auxChannel')}</label>
            <AuxChannelPicker
              selected={auxChannel}
              onChange={setAuxChannel}
              rcChannels={rcChannels}
            />
          </div>

          {/* Range slider */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-content">{t('modes:modesAdvancedEditor.pwmRange')}</label>
            <RangeSlider
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              rcValue={rcValue}
              onChange={(start, end) => {
                setRangeStart(start);
                setRangeEnd(end);
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-subtle flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={() => {
              onSave(auxChannel, rangeStart, rangeEnd);
              onClose();
            }}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            {t('common:save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ModesAdvancedEditor: React.FC = () => {
  const { t } = useTranslation();
  const {
    pendingModes,
    rcChannels,
    isLoading,
    saveError,
    addMode,
    removeMode,
    updateModeConfig,
    loadFromFC,
    startRcPolling,
    stopRcPolling,
    resetToOriginal,
    boxNameMapping,
  } = useModesWizardStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Start RC polling on mount
  useEffect(() => {
    loadFromFC();
    startRcPolling();
    return () => stopRcPolling();
  }, [loadFromFC, startRcPolling, stopRcPolling]);

  const getRcValue = (auxChannel: number) => rcChannels[auxChannel + 4] || 1500;
  const existingBoxIds = pendingModes.map((m) => m.boxId);

  return (
    <div className="space-y-0">
      {/* Unified action toolbar - connects visually with content below */}
      <div className="bg-surface border border-subtle border-b-0 rounded-t-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('modes:modesAdvancedEditor.addMode')}
            </button>
            <button
              onClick={resetToOriginal}
              className="px-3 py-1.5 text-content-secondary hover:text-content hover:bg-surface-raised text-sm rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('common:reset')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFromFC}
              disabled={isLoading}
              className="px-3 py-1.5 text-content-secondary hover:text-content hover:bg-surface-raised text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? t('common:loading') : t('common:reload')}
            </button>
            {/* Unsaved changes indicator - saves via main "Save All Changes" button */}
            {pendingModes.length > 0 && (
              <span className="text-xs text-content-secondary">
                {t('modes:modesAdvancedEditor.useMainSave')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content area - connects to toolbar above */}
      <div className="bg-surface border border-subtle border-t-0 rounded-b-xl p-4">
        {/* Error message */}
        {saveError && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
            {saveError}
          </div>
        )}

        {/* Mode list */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-content-secondary mt-2">{t('modes:modesAdvancedEditor.loadingModes')}</p>
          </div>
        ) : pendingModes.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-lg font-medium text-content mb-2">{t('modes:modesAdvancedEditor.noModesConfigured')}</h3>
            <p className="text-sm text-content-secondary max-w-md mx-auto mb-4">
              {t('modes:modesAdvancedEditor.noModesHint')}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              {t('modes:modesAdvancedEditor.addFirstMode')}
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {pendingModes.map((mode, index) => (
              <ModeCard
                key={index}
                mode={mode}
                rcValue={getRcValue(mode.auxChannel)}
                onEdit={() => setEditingIndex(index)}
                onDelete={() => removeMode(index)}
                expanded={false}
                showDescription={false}
                dynamicName={boxNameMapping[mode.boxId]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddModeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(boxId) => addMode(boxId)}
        existingModes={existingBoxIds}
      />

      <EditModeModal
        isOpen={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        mode={editingIndex !== null ? pendingModes[editingIndex] ?? null : null}
        rcChannels={rcChannels}
        onSave={(auxChannel, rangeStart, rangeEnd) => {
          if (editingIndex !== null) {
            updateModeConfig(editingIndex, { auxChannel, rangeStart, rangeEnd });
          }
        }}
        dynamicName={editingIndex !== null && pendingModes[editingIndex] ? boxNameMapping[pendingModes[editingIndex]!.boxId] : undefined}
      />
    </div>
  );
};

export default ModesAdvancedEditor;
