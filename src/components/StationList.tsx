import { Heart, Clock, Fuel, HelpCircle, Flame } from 'lucide-react';
import { GasStation, CityConfig } from '../types';

interface StationListProps {
  city: CityConfig;
  selectedFuel: string | null;
  stations: GasStation[];
  selectedStation: GasStation | null;
  onSelectStation: (station: GasStation) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  tankCapacity: number;
}

export default function StationList({
  city,
  selectedFuel,
  stations,
  selectedStation,
  onSelectStation,
  favorites,
  onToggleFavorite,
  tankCapacity
}: StationListProps) {
  
  const getBrandLogo = (station: GasStation) => {
    if (station.logoUrl) {
      return (
        <img
          src={station.logoUrl}
          alt={station.name}
          referrerPolicy="no-referrer"
          className="w-8 h-8 object-contain opacity-90 transition-transform duration-300 group-hover:scale-110"
        />
      );
    }

    if (station.brand === 'bp') {
      return (
        <img
          src="/bp-icon.png"
          alt="BP"
          className="w-8 h-8 object-contain transition-transform duration-300 group-hover:scale-110"
        />
      );
    }

    if (station.brand === 'repsol') {
      return (
        <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
          <img
            src="/repsol-icon.png"
            alt="Repsol"
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-110"
          />
        </div>
      );
    }

    const bgMap: Record<string, string> = {
      repsol: 'from-zinc-700 to-zinc-800',
      cepsa: 'from-zinc-700 to-zinc-800',
      shell: 'from-zinc-700 to-zinc-800',
      bp: 'from-zinc-700 to-zinc-800',
      disa: 'from-zinc-700 to-zinc-800',
      valero: 'from-zinc-700 to-zinc-800',
      chevron: 'from-zinc-700 to-zinc-800',
      generic: 'from-zinc-700 to-zinc-900',
    };

    const initial = station.name[0]?.toUpperCase() || 'G';
    const bg = bgMap[station.brand] || bgMap.generic;

    return (
      <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${bg} flex items-center justify-center font-bold text-sm text-white`}>
        {initial}
      </div>
    );
  };

  const lowestPrice = selectedFuel !== null
    ? Math.min(...stations.map(s => s.prices[selectedFuel] || Infinity))
    : Infinity;

  return (
    <div className="space-y-3">
      {stations.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
          <HelpCircle className="w-10 h-10 text-zinc-600 animate-pulse" />
          <p className="text-body-lg font-medium text-zinc-400">
            {city.id === 'sf' ? 'No stations match filters' : 'Sin gasolineras que coincidan'}
          </p>
          <p className="text-xs text-zinc-600">
            {city.id === 'sf' ? 'Try clearing search or filters' : 'Pruebe a cambiar el término de búsqueda'}
          </p>
        </div>
      ) : (
        stations.map(station => {
          const isSelected = selectedStation?.id === station.id;
          const isFavorite = favorites.includes(station.id);

          const hasFilter = selectedFuel !== null;
          const mainPrice = hasFilter
            ? station.prices[selectedFuel]
            : Math.min(...city.fuelTypes.map(ft => station.prices[ft.id] ?? Infinity));

          if (hasFilter && mainPrice === undefined) return null;

          const isCheapest = hasFilter && mainPrice === lowestPrice;
          const avgPrice = hasFilter
            ? stations.reduce((acc, current) => acc + (current.prices[selectedFuel] || 0), 0) / stations.length
            : 0;
          const diffPct = hasFilter ? ((mainPrice - avgPrice) / avgPrice) * 100 : 0;
          const costToFill = hasFilter ? mainPrice * tankCapacity : 0;

          return (
            <div
              key={station.id}
              onClick={() => onSelectStation(station)}
              id={`station-card-${station.id}`}
              className={`group transition-all duration-300 border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer select-none text-left relative overflow-hidden backdrop-blur-md ${
                isSelected
                  ? 'bg-zinc-950/90 border-emerald-500/50 shadow-lg shadow-emerald-950/20 md:translate-x-1'
                  : 'bg-zinc-900/40 border-white/5 hover:border-white/10 hover:bg-zinc-900/70'
              }`}
            >
              {hasFilter && isCheapest && (
                <div className="absolute top-0 right-0">
                  <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-emerald-500 text-zinc-950 px-2.5 py-1 rounded-bl-xl shadow-sm">
                    <Flame className="w-3 h-3 fill-current" />
                    {city.id === 'sf' ? 'Lowest' : 'Más Barato'}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-zinc-950 flex items-center justify-center shrink-0 border border-white/5 shadow-inner">
                  {getBrandLogo(station)}
                </div>
                <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-headline-md text-[17px] font-semibold text-zinc-100 truncate group-hover:text-emerald-400 transition-colors duration-200">
                      {station.name}
                    </h3>
                    <span className="inline-flex items-center text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                      {station.distance.toFixed(1)} {city.id === 'sf' ? 'mi' : 'km'}
                    </span>
                  </div>
                  <p className="text-body-sm text-zinc-400 truncate mt-0.5">
                    {station.address} • {station.municipality}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`w-2 h-2 rounded-full ${station.isOpen ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400 shadow-[0_0_8px_#f43f5e]'}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${station.isOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {station.isOpen
                        ? (city.id === 'sf' ? 'Open Now' : 'Abierto Ahora')
                        : (city.id === 'sf' ? 'Closed' : 'Cerrado')
                      }
                    </span>
                    <span className="text-zinc-600 text-xs">|</span>
                    <p className="text-xs text-zinc-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      {station.hours}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 self-start pt-1">
                  <p className={`font-data-display text-[26px] leading-none transition-colors duration-300 ${
                    hasFilter && isCheapest ? 'text-emerald-400 font-bold' : 'text-zinc-100'
                  }`}>
                    {city.currency}
                    {mainPrice.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}
                  </p>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mt-1.5">
                    {hasFilter
                      ? (city.id === 'sf' ? 'Price per gal' : 'Precio G95')
                      : (city.id === 'sf' ? 'From /gal' : 'Desde /L')
                    }
                  </p>
                  {hasFilter && (
                    <p className={`text-[10px] font-bold mt-1 uppercase ${
                      diffPct < 0 ? 'text-emerald-400' : diffPct > 5 ? 'text-rose-400' : 'text-zinc-500'
                    }`}>
                      {diffPct === 0
                        ? 'Average'
                        : `${diffPct < 0 ? '' : '+'}${diffPct.toFixed(1)}% vs avg`
                      }
                    </p>
                  )}
                </div>
              </div>

              {isSelected && (
                <div className="mt-2 pt-3 border-t border-white/5 text-xs text-zinc-400 animate-fadeIn bg-gradient-to-b from-zinc-950/20 to-zinc-950/60 p-3 rounded-xl border border-white/5">
                  {hasFilter ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block text-zinc-500 font-semibold tracking-wider uppercase text-[9px]">
                          {city.id === 'sf' ? 'Cost to Fill Gas Tank' : 'Coste por Depósito'}
                        </span>
                        <span className="text-[14px] font-bold text-zinc-100 font-data-display block mt-1">
                          {city.currency}
                          {costToFill.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-normal">
                          Based on {tankCapacity} {city.unit}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-zinc-500 font-semibold tracking-wider uppercase text-[9px]">
                          {city.id === 'sf' ? 'Potential Saving' : 'Ahorro Estimado'}
                        </span>
                        <span className="text-[14px] font-bold text-emerald-400 font-data-display block mt-1">
                          {isCheapest
                            ? `${city.currency}${(avgPrice * tankCapacity - costToFill).toFixed(2)}`
                            : city.id === 'sf' ? 'Optimal Choice' : 'Opción Óptima'
                          }
                        </span>
                        <span className="text-[10px] text-zinc-500 block">
                          {isCheapest
                            ? (city.id === 'sf' ? 'Lowest in SF' : 'El más barato en la zona')
                            : (city.id === 'sf' ? `Save by switching` : `Cambie para ahorrar`)
                          }
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {city.fuelTypes.map(ft => {
                        const p = station.prices[ft.id];
                        if (p === undefined) return null;
                        return (
                          <div key={ft.id} className="flex items-center justify-between bg-zinc-950/50 border border-white/5 rounded-xl px-3 py-2.5">
                            <span className="text-[12px] font-semibold text-zinc-300 uppercase tracking-wider">
                              {ft.label}
                            </span>
                            <span className="font-data-display text-[16px] font-bold text-emerald-400 leading-none">
                              {city.currency}{p.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(station.id);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
                        isFavorite
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                          : 'bg-zinc-800 text-zinc-300 border border-transparent hover:bg-zinc-700/60'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current text-rose-400 animate-pingOriginal' : ''}`} />
                      {isFavorite
                        ? (city.id === 'sf' ? 'In Saved Lists' : 'En Favoritos')
                        : (city.id === 'sf' ? 'Save Station' : 'Añadir a Favoritos')
                      }
                    </button>
                    <a
                      href={`https://maps.google.com/?q=${station.name}, ${station.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors font-semibold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {city.id === 'sf' ? 'Directions' : 'Cómo llegar'} &rarr;
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
