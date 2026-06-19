import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Search, 
  Settings, 
  Map as MapIcon, 
  List as ListIcon, 
  Heart, 
  Sparkles, 
  Compass, 
  Fuel, 
  SlidersHorizontal,
  ChevronRight,
  Globe2,
  ThumbsUp
} from 'lucide-react';

import { MOCK_STATIONS, CITIES } from './data';
import { GasStation, CityId, UserPreferences } from './types';

import InteractiveMap from './components/InteractiveMap';
import StationList from './components/StationList';
import AdvisorChat from './components/AdvisorChat';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [cityId, setCityId] = useState<CityId>('spain');
  const city = useMemo(() => CITIES[cityId], [cityId]);

  const [stations, setStations] = useState<GasStation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<'live_api' | 'local_fallback' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number }>(
    () => ({ lat: cityId === 'sf' ? 37.7749 : 40.4168, lon: cityId === 'sf' ? -122.4194 : -3.7038 })
  );

  const [selectedFuel, setSelectedFuel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    setUserLocation({
      lat: cityId === 'sf' ? 37.7749 : 40.4168,
      lon: cityId === 'sf' ? -122.4194 : -3.7038,
    });
  }, [cityId]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setSelectedStation(null);

    const params = new URLSearchParams({ city: cityId });

    fetch(`/api/stations?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setStations(data.stations || []);
          setDataSource(data.source || 'live_api');
          setLoading(false);
        }
      })
      .catch(err => {
        console.warn("Live gas API failed, loading local fallback:", err);
        if (isMounted) {
          setStations(MOCK_STATIONS[cityId] || []);
          setDataSource('local_fallback');
          setError(err.message || "Offline");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [cityId]);

  const [selectedStation, setSelectedStation] = useState<GasStation | null>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('geogas_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [tankCapacity, setTankCapacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('geogas_tank_capacity');
      return saved ? Number(saved) : 50;
    } catch {
      return 50;
    }
  });

  const [activeTab, setActiveTab] = useState<'map' | 'list' | 'favorites' | 'assistant'>('list');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [maxDistance, setMaxDistance] = useState<number>(100);
  const [showDistanceFilter, setShowDistanceFilter] = useState<boolean>(false);

  const mapSectionRef = useRef<HTMLDivElement>(null);
  const listAsideRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const userLocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMapMove = useCallback((center: { lat: number; lon: number }) => {
    if (userLocationTimerRef.current) clearTimeout(userLocationTimerRef.current);
    userLocationTimerRef.current = setTimeout(() => {
      setUserLocation(center);
    }, 300);
  }, []);

  const handleTabSelect = (tab: 'map' | 'list' | 'favorites' | 'assistant') => {
    setActiveTab(tab);
    if (tab === 'map') {
      setTimeout(() => {
        mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } else {
      setTimeout(() => {
        listAsideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  useEffect(() => {
    localStorage.setItem('geogas_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('geogas_tank_capacity', String(tankCapacity));
  }, [tankCapacity]);

  const handleCityChange = (newCityId: CityId) => {
    setCityId(newCityId);
    if (newCityId === 'sf') {
      setTankCapacity(12);
      setMaxDistance(25);
    } else {
      setTankCapacity(55);
      setMaxDistance(100);
    }
    setSelectedStation(null);
  };

  const handleToggleFavorite = (id: string) => {
    setFavorites(prev => {
      const exists = prev.includes(id);
      if (exists) {
        return prev.filter(fId => fId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const stationsWithDistance = useMemo(() => {
    if (!userLocation) return stations;
    return stations.map(station => {
      const distKm = haversineKm(userLocation.lat, userLocation.lon, station.latitude, station.longitude);
      return {
        ...station,
        distance: cityId === 'sf'
          ? parseFloat((distKm * 0.621371).toFixed(1))
          : parseFloat(distKm.toFixed(1)),
      };
    });
  }, [stations, userLocation, cityId]);

  const filteredStations = useMemo(() => {
    return stationsWithDistance.filter(station => {
      const matchesSearch = 
        station.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        station.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        station.municipality.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesDistance = station.distance <= maxDistance;

      if (activeTab === 'favorites') {
        return matchesSearch && matchesDistance && favorites.includes(station.id);
      }

      return matchesSearch && matchesDistance;
    });
  }, [stationsWithDistance, searchQuery, activeTab, favorites, maxDistance]);

  const sortedStations = useMemo(() => {
    if (selectedFuel === null) {
      return [...filteredStations].sort((a, b) => a.distance - b.distance);
    }
    return [...filteredStations].sort((a, b) => {
      const priceA = a.prices[selectedFuel] || Infinity;
      const priceB = b.prices[selectedFuel] || Infinity;
      return priceA - priceB;
    });
  }, [filteredStations, selectedFuel]);

  const lowestPriceStation = useMemo(() => {
    if (selectedFuel === null || !sortedStations.length) return null;
    return sortedStations[0];
  }, [sortedStations, selectedFuel]);

  return (
    <div className="min-h-screen md:h-screen bg-[#0e1511] text-[#dde4dd] font-sans flex flex-col overflow-x-hidden md:overflow-hidden antialiased">
      
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: 'radial-gradient(circle at 50% 120px, rgba(78,222,163,0.06) 0%, transparent 60%)'
      }} />

      <header className="sticky top-0 z-50 bg-zinc-950/40 backdrop-blur-xl border-b border-white/5 py-4 px-4 sm:px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setActiveTab('list')}>
            <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-emerald-400/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Fuel className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-headline-lg text-lg text-emerald-400 font-bold tracking-tight">GeoGas</h1>
              <p className="hidden xs:block text-[10px] text-zinc-500 uppercase tracking-widest leading-none font-semibold mt-0.5">
                {city.name}
              </p>
            </div>
          </div>

          <div className="flex-1 max-w-lg relative group">
            <div className="w-full bg-zinc-900/60 backdrop-blur-md border border-white/5 rounded-full flex items-center px-4 py-2 group-focus-within:border-emerald-500/40 group-focus-within:bg-zinc-950/80 transition-all duration-200 shadow-inner">
              <Search className="w-4 h-4 text-zinc-500 mr-2.5" />
              <input
                type="text"
                placeholder={cityId === 'sf' ? "Search fuel near San Francisco..." : "Filtrar por nombre o municipio..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none focus:outline-none w-full text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
              <SlidersHorizontal className="w-4 h-4 text-zinc-500 ml-2 cursor-pointer hover:text-emerald-400 transition-colors" onClick={() => setShowSettings(true)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleCityChange(cityId === 'sf' ? 'spain' : 'sf')}
              className="px-3.5 py-1.5 hidden md:flex items-center gap-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 font-semibold border border-white/5 transition-colors cursor-pointer select-none"
              title="Toggle target region"
            >
              <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
              {cityId === 'sf' ? 'US (SF)' : 'ES (Spain)'}
            </button>

            <button
              onClick={() => handleTabSelect(activeTab === 'assistant' ? 'list' : 'assistant')}
              className={`p-2.5 rounded-full transition-colors relative cursor-pointer ${
                activeTab === 'assistant' 
                  ? 'bg-emerald-500 text-zinc-950' 
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100 border border-white/5'
              }`}
              title="AI Fuel Assistant"
            >
              <Sparkles className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="p-2.5 rounded-full bg-zinc-900 border border-white/5 text-zinc-400 hover:text-zinc-100 hover:border-white/10 active:scale-95 transition-all cursor-pointer"
              title="Open preferences panel"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-28 md:py-4 md:pb-4 flex flex-col md:flex-row gap-6 relative z-10 md:min-h-0">
        
        <aside ref={listAsideRef} className="w-full md:w-[410px] flex flex-col shrink-0 gap-5 md:h-full md:min-h-0">
          
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-body-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                {activeTab === 'favorites'
                  ? (cityId === 'sf' ? 'Your Saved Stations' : 'Tus Gasolineras Guardadas')
                  : selectedFuel === null
                    ? (cityId === 'sf' ? 'All Nearby Stations' : 'Todas las Gasolineras')
                    : (cityId === 'sf' ? 'Nearby Best Values' : 'Gasolineras Gasolina 95 y Diesel')
                }
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                {cityId === 'sf'
                  ? (selectedFuel === null ? `Showing ${sortedStations.length} stations sorted by distance` : `Showing top ${sortedStations.length} offers within 10 miles`)
                  : (selectedFuel === null ? `Se muestran las ${sortedStations.length} estaciones ordenadas por distancia` : `Se muestran las ${sortedStations.length} opciones más baratas en ${city.name}`)
                }
              </p>
              {loading && (
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium mt-1">
                  <div className="w-2.5 h-2.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span>{cityId === 'sf' ? "Syncing from live API..." : "Actualizando desde API..."}</span>
                </div>
              )}
              {!loading && dataSource === 'live_api' && (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold mt-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span>{cityId === 'sf' ? "Live API prices active" : "API en tiempo real conectada"}</span>
                </div>
              )}
              {!loading && dataSource === 'local_fallback' && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-bold mt-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  <span>{cityId === 'sf' ? "Development cache mode" : "Modo local fallback (desarrollo)"}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => handleTabSelect(activeTab === 'favorites' ? 'list' : 'favorites')}
              className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${
                activeTab === 'favorites' ? 'text-rose-400' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${activeTab === 'favorites' ? 'fill-current' : ''}`} />
              {activeTab === 'favorites' ? 'Ver Todo' : 'Favoritos'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-station pb-1 select-none flex-1">
              {city.fuelTypes.map(fType => {
                const isActive = selectedFuel === fType.id;
                return (
                  <button
                    key={fType.id}
                    onClick={() => setSelectedFuel(isActive ? null : fType.id)}
                    className={`px-4 py-2 rounded-full font-semibold text-xs tracking-wide transition-all active:scale-95 duration-100 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-900/40 text-zinc-400 border border-white/5 hover:border-white/10 hover:bg-zinc-900'
                    }`}
                  >
                    {fType.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                const goingToHide = showDistanceFilter;
                setShowDistanceFilter(!showDistanceFilter);
              }}
              className={`p-2 py-2 rounded-full border transition-all duration-200 cursor-pointer shrink-0 ${
                showDistanceFilter 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-lg shadow-emerald-500/5' 
                  : 'bg-zinc-900/40 text-zinc-400 border-white/5 hover:border-white/10 hover:bg-zinc-900'
              }`}
              title={cityId === 'sf' ? 'Filter by Search Radius' : 'Filtrar por Radio de Distancia'}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {showDistanceFilter && (
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-3 shadow-inner animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-emerald-400" />
                  {cityId === 'sf' ? 'Search Radius' : 'Radio de Distancia'}
                </span>
                <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-md">
                  {maxDistance === 25 
                    ? (cityId === 'sf' ? 'Any distance' : 'Cualquier distancia')
                    : `${maxDistance} ${cityId === 'sf' ? 'mi' : 'km'}`
                  }
                </span>
              </div>

              <div className="relative pt-1">
                <input
                  id="distance-range-slider"
                  type="range"
                  min={0.5}
                  max={cityId === 'sf' ? 25 : 500}
                  step={cityId === 'sf' ? 0.5 : 10}
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-medium px-0.5 mt-2">
                  <span>0.5 {cityId === 'sf' ? 'mi' : 'km'}</span>
                  <span>{cityId === 'sf' ? 5 : 100} {cityId === 'sf' ? 'mi' : 'km'}</span>
                  <span>{cityId === 'sf' ? 10 : 250} {cityId === 'sf' ? 'mi' : 'km'}</span>
                  <span>{cityId === 'sf' ? 25 : 500} {cityId === 'sf' ? 'mi' : 'km'}</span>
                </div>
              </div>

              <div className="flex gap-1.5 justify-start pt-1">
                {(cityId === 'sf' ? [5, 10, 25] : [50, 100, 500]).map(radius => {
                  const isSelected = maxDistance === radius;
                  return (
                    <button
                      key={radius}
                      onClick={() => setMaxDistance(radius)}
                      className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-950/40 text-zinc-400 border-white/5 hover:border-white/10 hover:bg-zinc-900'
                      }`}
                    >
                      {radius === (cityId === 'sf' ? 25 : 500)
                        ? (cityId === 'sf' ? 'Max (25 mi)' : 'Max (500 km)')
                        : `${radius} ${cityId === 'sf' ? 'mi' : 'km'}`
                      }
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {lowestPriceStation && selectedFuel !== null && (
            <div className="bg-zinc-950/50 border border-emerald-500/20 rounded-2xl p-3.5 flex items-center justify-between text-left backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/15">
                  <span className="font-bold text-sm">%</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {cityId === 'sf' ? 'Best Daily Value' : 'Mejor Oferta Local'}
                  </h4>
                  <p className="text-xs text-zinc-300 font-semibold truncate max-w-[180px]">
                    {lowestPriceStation.name}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[20px] font-bold font-data-display text-emerald-400 block leading-none">
                  {city.currency}
                  {lowestPriceStation.prices[selectedFuel]?.toFixed(3).replace('.', cityId === 'spain' ? ',' : '.')}
                </span>
                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5 block">
                  {cityId === 'sf' ? 'Save on drive!' : '¡Ahorro Máximo!'}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'assistant' ? (
            <AdvisorChat city={city} selectedFuel={selectedFuel} stations={stations} onClose={() => setActiveTab('list')} />
          ) : (
            <div ref={listScrollRef} className="flex-1 overflow-y-auto pr-1 space-y-3 max-h-[380px] sm:max-h-[420px] md:max-h-none md:h-0 md:min-h-0 scrollbar-station">
              <StationList
                city={city}
                selectedFuel={selectedFuel}
                stations={sortedStations}
                selectedStation={selectedStation}
                onSelectStation={(station) => {
                  setSelectedStation(station);
                  setTimeout(() => {
                    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 50);
                }}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                tankCapacity={tankCapacity}
              />
            </div>
          )}
        </aside>

        <section ref={mapSectionRef} className="w-full h-[320px] sm:h-[400px] md:h-full md:flex-1 rounded-3xl border border-white/5 overflow-hidden shadow-2xl relative order-first md:order-last">
          <InteractiveMap
            city={city}
            selectedFuel={selectedFuel}
            stations={filteredStations}
            selectedStation={selectedStation}
            onSelectStation={(station) => {
              setSelectedStation(station);
              setTimeout(() => {
                document.getElementById(`station-card-${station.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }}
            favorites={favorites}
            onMapMove={handleMapMove}
          />
        </section>

      </main>

      <div className="md:hidden fixed bottom-24 right-4 z-40">
        <button
          onClick={() => handleTabSelect(activeTab === 'map' ? 'list' : 'map')}
          className="bg-emerald-400 text-zinc-950 p-4 rounded-full border border-emerald-300 shadow-2xl active:scale-90 transition-transform duration-100 flex items-center justify-center gap-1.5 focus:outline-none"
        >
          {activeTab === 'map' ? (
            <>
              <ListIcon className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-wider pr-1">Ver Lista</span>
            </>
          ) : (
            <>
              <MapIcon className="w-5 h-5 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider pr-1">Ver Mapa</span>
            </>
          )}
        </button>
      </div>

      <nav className="md:hidden fixed bottom-0 w-full z-40 bg-zinc-950/80 backdrop-blur-xl border-t border-white/5 px-6 pb-6 pt-3 flex justify-around items-center rounded-t-3xl shadow-2xl">
        <button
          onClick={() => handleTabSelect('map')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-full transition-all cursor-pointer ${
            activeTab === 'map' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15' : 'text-zinc-400'
          }`}
        >
          <MapIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleTabSelect('list')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-full transition-all cursor-pointer ${
            activeTab === 'list' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15' : 'text-zinc-400'
          }`}
        >
          <ListIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => handleTabSelect('favorites')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-full transition-all cursor-pointer ${
            activeTab === 'favorites' ? 'text-rose-400 bg-rose-500/10 border border-rose-500/15' : 'text-zinc-400'
          }`}
        >
          <Heart className={`w-5 h-5 ${activeTab === 'favorites' ? 'fill-current' : ''}`} />
        </button>

        <button
          onClick={() => handleTabSelect(activeTab === 'assistant' ? 'list' : 'assistant')}
          className={`flex flex-col items-center justify-center p-2.5 rounded-full transition-all cursor-pointer ${
            activeTab === 'assistant' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15' : 'text-zinc-400'
          }`}
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </nav>

      {showSettings && (
        <SettingsPanel
          city={city}
          onCityChange={handleCityChange}
          tankCapacity={tankCapacity}
          onTankCapacityChange={setTankCapacity}
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer className="hidden md:block py-6 border-t border-white/5 text-center text-[11px] text-zinc-500 bg-zinc-950/20">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-1 text-zinc-500">
          <span>© 2026 GeoGas · Desarrollado por</span>
          <a
            href="https://github.com/Crttn"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-4 decoration-emerald-500/30"
          >
            Crttn
          </a>
        </div>
      </footer>
    </div>
  );
}
