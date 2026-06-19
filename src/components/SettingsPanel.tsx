import { Settings, X, HardDrive, Sliders, Globe, ShieldCheck } from 'lucide-react';
import { CityConfig, CityId } from '../types';

interface SettingsPanelProps {
  city: CityConfig;
  onCityChange: (cityId: CityId) => void;
  tankCapacity: number;
  onTankCapacityChange: (capacity: number) => void;
  onClose: () => void;
}

export default function SettingsPanel({
  city,
  onCityChange,
  tankCapacity,
  onTankCapacityChange,
  onClose
}: SettingsPanelProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative text-left animate-scaleUp">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2 text-zinc-100">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="text-body-lg font-bold tracking-tight">
              {city.id === 'sf' ? 'Settings & Preferences' : 'Ajustes y Preferencias'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-[6px] rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors border border-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div className="space-y-3">
            <label className="text-xs uppercase font-semibold text-zinc-500 tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              {city.id === 'sf' ? 'Region Coverage' : 'Región y Divisa'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onCityChange('spain')}
                className={`py-3 px-4 rounded-xl text-xs font-semibold text-center border transition-all ${
                  city.id === 'spain'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-900/40 text-zinc-400 border-white/5 hover:border-white/10 hover:bg-zinc-900'
                }`}
              >
                España
                <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">Euro (€) • Litros</span>
              </button>
              <button
                onClick={() => onCityChange('sf')}
                className={`py-3 px-4 rounded-xl text-xs font-semibold text-center border transition-all ${
                  city.id === 'sf'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-900/40 text-zinc-400 border-white/5 hover:border-white/10 hover:bg-zinc-900'
                }`}
              >
                San Francisco, USA
                <span className="block text-[10px] text-zinc-500 font-normal mt-0.5">USD ($) • Gallons</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs text-zinc-400">
              <label className="uppercase font-semibold text-zinc-500 tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                {city.id === 'sf' ? 'Fuel Tank Size' : 'Capacidad de Depósito'}
              </label>
              <span className="font-bold text-zinc-200">
                {tankCapacity} {city.unit}
              </span>
            </div>

            <input
              type="range"
              min={city.id === 'sf' ? 5 : 20}
              max={city.id === 'sf' ? 30 : 100}
              step={1}
              value={tankCapacity}
              onChange={(e) => onTankCapacityChange(Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[11px] text-zinc-500 text-center">
              {city.id === 'sf' 
                ? 'Used to compute total costs when expanding station price details.' 
                : 'Utilizado para calcular simulaciones del coste total para tu depósito.'}
            </p>
          </div>

          <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-2xl flex gap-3 text-[11px] text-zinc-400">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block font-bold text-zinc-200">
                {city.id === 'sf' ? 'Self-Managed Secure Credentials' : 'Credenciales e Integridad de IA'}
              </span>
              <p>
                {city.id === 'sf' 
                  ? 'The Gemini API runs entirely cloud container server-side using your personal API key injected safely from AI Studio Secrets panel.' 
                  : 'Las consultas al Asesor Inteligente de Gemini se procesan de forma segura en servidor sin exponer claves de API a navegadores.'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/30 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            {city.id === 'sf' ? 'Apply changes' : 'Aplicar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
