import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/useConfigStore';
import { DEFAULT_MODEL_PRICING_CONFIG, type ManualModelPrice, type ModelPricingConfig } from '../../types/config';
import { request } from '../../utils/request';
import { showToast } from '../common/ToastContainer';

interface ApiPricingItem {
    model: string;
    input: number;
    output: number;
    cached: number;
}

interface ApiPricingSnapshot {
    prices: ApiPricingItem[];
    fetched_at: number;
    stale: boolean;
    source: string;
    warning?: string | null;
}

export default function ModelPricingSettings() {
    const { t } = useTranslation();
    const { config, saveConfig } = useConfigStore();
    const pricingConfig = config?.model_pricing ?? DEFAULT_MODEL_PRICING_CONFIG;

    const [snapshot, setSnapshot] = useState<ApiPricingSnapshot | null>(null);
    const [syncing, setSyncing] = useState(false);

    const [modelName, setModelName] = useState('');
    const [inputPrice, setInputPrice] = useState('');
    const [outputPrice, setOutputPrice] = useState('');
    const [cachedPrice, setCachedPrice] = useState('');
    const [formError, setFormError] = useState('');

    const loadPricing = useCallback(async () => {
        try {
            const result = await request<ApiPricingSnapshot>('get_api_pricing');
            setSnapshot(result);
        } catch {
            // Keep UI usable even if initial pricing fetch fails
        }
    }, []);

    useEffect(() => {
        void loadPricing();
    }, [loadPricing]);

    const updatePricingConfig = async (patch: Partial<ModelPricingConfig>) => {
        if (!config) return;
        const nextConfig: ModelPricingConfig = {
            ...DEFAULT_MODEL_PRICING_CONFIG,
            ...config.model_pricing,
            ...patch,
        };
        try {
            await saveConfig({ ...config, model_pricing: nextConfig }, true);
            await loadPricing();
        } catch (err) {
            showToast(String(err), 'error');
        }
    };

    const handleSyncNow = async () => {
        setSyncing(true);
        try {
            const result = await request<ApiPricingSnapshot>('sync_api_pricing');
            setSnapshot(result);
            if (result.warning) {
                showToast(result.warning, 'warning');
            } else {
                showToast(t('model_pricing_settings.sync_success', { count: result.prices.length }), 'success');
            }
        } catch (err) {
            showToast(String(err), 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleAddOrUpdateManual = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        const trimmedModel = modelName.trim();
        if (!trimmedModel) {
            setFormError(t('model_pricing_settings.error_model_required'));
            return;
        }

        const parsedInput = Number(inputPrice);
        const parsedOutput = Number(outputPrice);
        const parsedCached = cachedPrice.trim() === '' ? 0 : Number(cachedPrice);

        if (
            !Number.isFinite(parsedInput) || parsedInput < 0
            || !Number.isFinite(parsedOutput) || parsedOutput < 0
            || !Number.isFinite(parsedCached) || parsedCached < 0
        ) {
            setFormError(t('model_pricing_settings.error_invalid_price'));
            return;
        }

        const entry: ManualModelPrice = {
            model: trimmedModel,
            input: parsedInput,
            output: parsedOutput,
            cached: parsedCached,
        };

        const existing = pricingConfig.manual_prices ?? [];
        const nextList = [
            ...existing.filter(item => item.model.trim().toLowerCase() !== trimmedModel.toLowerCase()),
            entry,
        ];

        await updatePricingConfig({ manual_prices: nextList });
        setModelName('');
        setInputPrice('');
        setOutputPrice('');
        setCachedPrice('');
        showToast(t('model_pricing_settings.manual_saved', { model: trimmedModel }), 'success');
    };

    const handleRemoveManual = async (targetModel: string) => {
        const nextList = (pricingConfig.manual_prices ?? []).filter(
            item => item.model !== targetModel,
        );
        await updatePricingConfig({ manual_prices: nextList });
    };

    const handleEditManual = (entry: ManualModelPrice) => {
        setModelName(entry.model);
        setInputPrice(String(entry.input));
        setOutputPrice(String(entry.output));
        setCachedPrice(String(entry.cached));
        setFormError('');
    };

    const suggestedModels = useMemo(() => {
        const names = (snapshot?.prices ?? []).map(p => p.model);
        return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    }, [snapshot]);

    return (
        <section
            aria-labelledby="model-pricing-settings-title"
            className="bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all space-y-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <Coins className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 id="model-pricing-settings-title" className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {t('model_pricing_settings.title')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('model_pricing_settings.description')}
                        </p>
                    </div>
                </div>
            </div>

            {/* models.dev 自动同步 */}
            <div className="p-3.5 bg-gray-50/70 dark:bg-slate-800/40 rounded-xl border border-gray-200/60 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 flex flex-wrap items-center gap-2">
                        <span>{t('model_pricing_settings.auto_sync_label')}</span>
                        {snapshot && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-gray-600 dark:text-gray-300">
                                {t('model_pricing_settings.loaded_count', { count: snapshot.prices.length, source: snapshot.source })}
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('model_pricing_settings.auto_sync_desc')}
                    </div>
                    {snapshot?.warning && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                            {snapshot.warning}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={pricingConfig.auto_sync_models_dev}
                            onChange={(e) => void updatePricingConfig({ auto_sync_models_dev: e.target.checked })}
                            className="checkbox checkbox-xs rounded"
                        />
                        <span>{t('model_pricing_settings.enable_auto_sync')}</span>
                    </label>

                    <button
                        type="button"
                        onClick={() => void handleSyncNow()}
                        disabled={syncing || !pricingConfig.auto_sync_models_dev}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                        <span>{t('model_pricing_settings.sync_now')}</span>
                    </button>
                </div>
            </div>

            {/* 手动模型价格 */}
            <div className="space-y-3">
                <div>
                    <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {t('model_pricing_settings.manual_title')}
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('model_pricing_settings.manual_desc')}
                    </p>
                </div>

                <form onSubmit={(e) => void handleAddOrUpdateManual(e)} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-4">
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t('model_pricing_settings.col_model')}
                        </label>
                        <input
                            type="text"
                            list="model-pricing-suggestions"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder={t('model_pricing_settings.model_placeholder')}
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
                        />
                        <datalist id="model-pricing-suggestions">
                            {suggestedModels.map(name => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t('model_pricing_settings.col_input')}
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={inputPrice}
                            onChange={(e) => setInputPrice(e.target.value)}
                            placeholder="0.30"
                            className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-right"
                        />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t('model_pricing_settings.col_output')}
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={outputPrice}
                            onChange={(e) => setOutputPrice(e.target.value)}
                            placeholder="2.50"
                            className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-right"
                        />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                            {t('model_pricing_settings.col_cached')}
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={cachedPrice}
                            onChange={(e) => setCachedPrice(e.target.value)}
                            placeholder="0.03"
                            className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-right"
                        />
                    </div>

                    <div className="sm:col-span-2">
                        <button
                            type="submit"
                            className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('model_pricing_settings.save_price')}</span>
                        </button>
                    </div>
                </form>

                {formError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {formError}
                    </p>
                )}

                {(pricingConfig.manual_prices ?? []).length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-slate-800">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="px-3 py-2 font-medium">{t('model_pricing_settings.col_model')}</th>
                                    <th className="px-3 py-2 font-medium text-right">{t('model_pricing_settings.col_input')}</th>
                                    <th className="px-3 py-2 font-medium text-right">{t('model_pricing_settings.col_output')}</th>
                                    <th className="px-3 py-2 font-medium text-right">{t('model_pricing_settings.col_cached')}</th>
                                    <th className="px-3 py-2 font-medium text-right">{t('model_pricing_settings.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                {(pricingConfig.manual_prices ?? []).map(entry => (
                                    <tr key={entry.model} className="hover:bg-gray-50/70 dark:hover:bg-slate-800/30">
                                        <td className="px-3 py-2 font-mono text-gray-800 dark:text-gray-200">
                                            <button
                                                type="button"
                                                onClick={() => handleEditManual(entry)}
                                                className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title={t('model_pricing_settings.click_to_edit')}
                                            >
                                                {entry.model}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-right text-gray-700 dark:text-gray-300">${entry.input}</td>
                                        <td className="px-3 py-2 font-mono text-right text-gray-700 dark:text-gray-300">${entry.output}</td>
                                        <td className="px-3 py-2 font-mono text-right text-gray-700 dark:text-gray-300">${entry.cached}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => void handleRemoveManual(entry.model)}
                                                aria-label={t('model_pricing_settings.delete_price', { model: entry.model })}
                                                className="inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
