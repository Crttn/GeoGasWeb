import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Minus, Plus, Compass, Sun, TrendingDown } from 'lucide-react';
import { GasStation, CityConfig } from '../types';
import OLMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import 'ol/ol.css';

interface InteractiveMapProps {
  city: CityConfig;
  selectedFuel: string | null;
  stations: GasStation[];
  selectedStation: GasStation | null;
  onSelectStation: (station: GasStation) => void;
  favorites: string[];
  onMapMove?: (center: { lat: number; lon: number }) => void;
}

const FILLS: Record<string, string> = {
  cheap: '#22c55e', medium: '#eab308', expensive: '#ef4444', neutral: '#10b981',
};
const STROKES: Record<string, string> = {
  cheap: '#15803d', medium: '#a16207', expensive: '#b91c1c', neutral: '#047857',
};

const styleCache = new Map<string, Style>();

function dotStyle(tier: string, radius: number, hover: boolean, selected: boolean): Style[] {
  const k = `${tier}_${radius}_${hover}_${selected}`;
  let s = styleCache.get(k);
  if (s) return [s];

  const circle = new CircleStyle({
    radius: selected ? 14 : hover ? radius + 2 : radius,
    fill: new Fill({ color: selected ? 'rgba(16,185,129,0.15)' : FILLS[tier] }),
    stroke: new Stroke({ color: selected ? '#10b981' : STROKES[tier], width: selected ? 2.5 : hover ? 2 : 1 }),
  });

  s = new Style({ image: circle });
  styleCache.set(k, s);
  return [s];
}

export default function InteractiveMap({
  city, selectedFuel, stations, selectedStation,
  onSelectStation, favorites, onMapMove
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<OLMap | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const featuresRef = useRef<Map<string, Feature>>(new Map());
  const onSelectRef = useRef(onSelectStation);
  onSelectRef.current = onSelectStation;
  const onMoveRef = useRef(onMapMove);
  onMoveRef.current = onMapMove;
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedStation?.id || null;
  const fuelRef = useRef(selectedFuel);
  fuelRef.current = selectedFuel;

  const [hoveredStation, setHoveredStation] = useState<GasStation | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [temp] = useState(city.id === 'sf' ? 62 : 21);

  const projected = useMemo(() => {
    return stations.map(s => ({ station: s, proj: fromLonLat([s.longitude, s.latitude]) }));
  }, [stations]);

  const priceBounds = useMemo(() => {
    if (!selectedFuel) return null;
    const prices = stations.map(s => s.prices[selectedFuel]).filter(p => p !== undefined && p > 0);
    return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  }, [stations, selectedFuel]);

  const averagePrice = useMemo(() => {
    if (!selectedFuel) return 0;
    const p = stations.map(s => s.prices[selectedFuel]).filter(p => p !== undefined);
    return p.length ? p.reduce((a, b) => a + b) / p.length : 0;
  }, [stations, selectedFuel]);

  function tierOf(station: GasStation): string {
    if (!fuelRef.current || !priceBounds) return 'neutral';
    const price = station.prices[fuelRef.current];
    if (price === undefined) return 'neutral';
    const range = priceBounds.max - priceBounds.min;
    if (range <= 0) return 'cheap';
    const r = (price - priceBounds.min) / range;
    if (r < 0.33) return 'cheap';
    if (r < 0.66) return 'medium';
    return 'expensive';
  }

  const projectedRef = useRef(projected);
  projectedRef.current = projected;

  function syncFeatures(visibleIds: Set<string>) {
    const source = vectorSourceRef.current;
    if (!source) return;

    const fm = featuresRef.current;
    const existing = new Set(fm.keys());
    const toAdd: Feature[] = [];
    const toRemove: string[] = [];

    existing.forEach(id => { if (!visibleIds.has(id)) toRemove.push(id); });

    toRemove.forEach(id => {
      const f = fm.get(id);
      if (f) source.removeFeature(f);
      fm.delete(id);
    });

    visibleIds.forEach(id => {
      if (fm.has(id)) return;
      const item = projectedRef.current.find(p => p.station.id === id);
      if (!item) return;
      const f = new Feature({ geometry: new Point(item.proj) });
      f.setId(id);
      f.set('station', item.station);
      f.set('tier', tierOf(item.station));
      fm.set(id, f);
      toAdd.push(f);
    });

    if (toAdd.length) source.addFeatures(toAdd);
  }

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type: string, attrs?: any) {
      return origGetContext.call(this, type, { ...attrs, willReadFrequently: true });
    };

    const center = city.id === 'sf' ? [-122.4194, 37.7749] : [-3.7, 40.4];
    const map = new OLMap({
      target: mapContainerRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({ url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attributions: '© OpenStreetMap contributors © CARTO' }),
          className: 'dark-map-layer',
        }),
      ],
      view: new View({ center: fromLonLat(center), zoom: city.id === 'sf' ? 13 : 6, maxZoom: 18, minZoom: 4 }),
      controls: [],
    });

    const source = new VectorSource({ useSpatialIndex: false });
    const layer = new VectorLayer({
      source,
      style: (f) => {
        const tier = f.get('tier') || 'neutral';
        const id = f.getId() as string;
        const hover = id === hoveredIdRef.current;
        const sel = id === selectedIdRef.current;
        return dotStyle(tier, 5, hover, sel);
      },
    });

    map.addLayer(layer);
    vectorSourceRef.current = source;
    vectorLayerRef.current = layer;
    mapInstanceRef.current = map;

    map.on('click', (e) => {
      const f = map.forEachFeatureAtPixel(e.pixel, feat => feat);
      if (f) {
        const s = f.get('station') as GasStation;
        if (s) onSelectRef.current(s);
      }
    });

    map.on('pointermove', (e) => {
      if (e.dragging) return;
      const px = map.getEventPixel(e.originalEvent);
      const f = map.forEachFeatureAtPixel(px, feat => feat);
      const id = f ? f.getId() as string : null;
      if (id !== hoveredIdRef.current) {
        hoveredIdRef.current = id;
        layer.changed();
      }
      map.getTargetElement().style.cursor = f ? 'pointer' : '';

      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (f) {
        const station = f.get('station') as GasStation;
        hoverTimerRef.current = setTimeout(() => setHoveredStation(station), 120);
      } else {
        hoverTimerRef.current = setTimeout(() => setHoveredStation(null), 120);
      }
    });

    const ro = new ResizeObserver(() => map.updateSize());
    if (mapContainerRef.current) ro.observe(mapContainerRef.current);

    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      ro.disconnect();
      map.setTarget(undefined);
      mapInstanceRef.current = null;
      vectorSourceRef.current = null;
      vectorLayerRef.current = null;
    };
  }, [city.id]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const update = () => {
      const size = map.getSize();
      if (!size) return;
      const view = map.getView();
      const extent = view.calculateExtent(size);
      const center = view.getCenter();

      const w = extent[2] - extent[0], h = extent[3] - extent[1];
      const bx = w * 0.1, by = h * 0.1;
      const minX = extent[0] - bx, maxX = extent[2] + bx;
      const minY = extent[1] - by, maxY = extent[3] + by;

      const ids = new Set<string>();
      projectedRef.current.forEach(({ station, proj }) => {
        if (proj[0] >= minX && proj[0] <= maxX && proj[1] >= minY && proj[1] <= maxY) {
          const fuel = fuelRef.current;
          if (!fuel || station.prices[fuel] !== undefined) ids.add(station.id);
        }
      });

      syncFeatures(ids);

      if (center) {
        const [lon, lat] = toLonLat(center);
        onMoveRef.current?.({ lat, lon });
      }
    };

    update();
    map.on('moveend', update);
    return () => map.un('moveend', update);
  }, [city.id]);

  useEffect(() => {
    vectorLayerRef.current?.changed();
  }, [selectedStation?.id]);

  const skipPan = useRef(false);

  useEffect(() => {
    if (selectedStation && mapInstanceRef.current && !skipPan.current) {
      mapInstanceRef.current.getView().animate({
        center: fromLonLat([selectedStation.longitude, selectedStation.latitude]),
        zoom: city.id === 'sf' ? 16 : 15,
        duration: 800,
      });
    }
    skipPan.current = false;
  }, [selectedStation, city.id]);

  const zoomIn = useCallback(() => {
    const v = mapInstanceRef.current?.getView();
    if (v) v.animate({ zoom: (v.getZoom() || 0) + 0.5, duration: 200 });
  }, []);

  const zoomOut = useCallback(() => {
    const v = mapInstanceRef.current?.getView();
    if (v) v.animate({ zoom: (v.getZoom() || 0) - 0.5, duration: 200 });
  }, []);

  const recenter = useCallback(() => {
    const c = city.id === 'sf' ? [-122.4194, 37.7749] : [-3.7038, 40.4168];
    mapInstanceRef.current?.getView().animate({ center: fromLonLat(c), zoom: city.id === 'sf' ? 13 : 6, duration: 800 });
  }, [city.id]);

  return (
    <div className="relative w-full h-full bg-[#080d0a]">
      <style>{`
        .dark-map-layer .ol-layer { filter: brightness(0.68) contrast(1.22) saturate(0.8) !important; }
        .ol-viewport { position: absolute; width: 100%; height: 100%; }
      `}</style>

      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500 via-transparent to-transparent bg-[size:20px_20px] bg-[linear-gradient(to_right,#10b981_1px,transparent_1px),linear-gradient(to_bottom,#10b981_1px,transparent_1px)]" />

      {hoveredStation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 backdrop-blur-md border border-zinc-700 px-5 py-3 rounded-2xl shadow-2xl min-w-[300px] max-w-[90%] pointer-events-none transition-all duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold text-zinc-100 truncate">{hoveredStation.name}</p>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                  {hoveredStation.distance.toFixed(1)} {city.id === 'sf' ? 'mi' : 'km'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">{hoveredStation.address}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${hoveredStation.isOpen ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className={`text-[10px] font-semibold ${hoveredStation.isOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {hoveredStation.isOpen ? (city.id === 'sf' ? 'Open' : 'Abierto') : (city.id === 'sf' ? 'Closed' : 'Cerrado')}
                </span>
                <span className="text-zinc-600 text-[10px]">|</span>
                <span className="text-[10px] text-zinc-400">{hoveredStation.hours}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-0 mt-2 pt-2 border-t border-zinc-800">
            {city.fuelTypes.map((ft, idx) => {
              const p = hoveredStation.prices[ft.id];
              if (p === undefined) return null;
              return (
                <>
                  {idx > 0 && <span className="text-zinc-700 text-[14px] font-light mx-2">|</span>}
                  <div className="text-center" key={ft.id}>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{ft.label}</p>
                    <p className="text-[15px] font-bold text-emerald-400 font-data-display leading-none mt-0.5">
                      {city.currency}{p.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}
                    </p>
                  </div>
                </>
              );
            })}
          </div>
        </div>
      )}

      <div className="map-controls-prevent absolute bottom-4 left-4 flex flex-wrap items-center gap-2 p-3 md:p-4 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl select-none text-[13px] md:text-body-sm font-medium z-10">
        <div className="flex items-center gap-2 text-zinc-300">
          <Sun className="w-4 h-4 text-emerald-400 animate-spinOriginal slow" />
          <span className="font-semibold text-zinc-100">{temp}°{city.id === 'sf' ? 'F' : 'C'}</span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400 font-normal">{city.id === 'sf' ? 'Sunny' : 'Despejado'}</span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-white/10 mx-2" />
        <div className="flex items-center gap-1.5 text-emerald-400">
          <TrendingDown className="w-4 h-4" />
          <span className="text-zinc-400 font-normal">{city.id === 'sf' ? 'Market Avg:' : 'Precio Medio:'}</span>
          <span className="font-semibold font-data-display">
            {city.currency}{averagePrice.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}{city.id === 'spain' ? ' / L' : ' / gal'}
          </span>
        </div>
      </div>

      <div className="absolute top-24 left-4 z-10 pointer-events-none bg-zinc-950/75 border border-white/10 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg text-[11px] font-label-caps tracking-wider text-zinc-400">
        GPS: {city.id === 'sf' ? '37.7749° N, 122.4194° W' : '40.4168° N, 3.7038° W'}
      </div>

      <div className="absolute top-36 left-4 z-10 bg-zinc-950/80 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-xl flex flex-col gap-2 text-[10px] font-semibold text-zinc-300 min-w-[140px] select-none">
        <p className="text-zinc-500 text-[8px] uppercase tracking-wider font-bold border-b border-white/5 pb-1">
          {selectedFuel ? `Precio (${selectedFuel})` : (city.id === 'sf' ? 'Legend' : 'Leyenda')}
        </p>
        {selectedFuel ? (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] border border-[#15803d] shrink-0" />
              <span>{city.id === 'sf' ? 'Cheap' : 'Económico'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#eab308] border border-[#a16207] shrink-0" />
              <span>{city.id === 'sf' ? 'Average' : 'Medio'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-[#b91c1c] shrink-0" />
              <span>{city.id === 'sf' ? 'Expensive' : 'Caro'}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#047857] shrink-0" />
            <span>{city.id === 'sf' ? 'All Stations' : 'Todas las estaciones'}</span>
          </div>
        )}
      </div>

      <div className="map-controls-prevent absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button onClick={zoomIn} className="w-12 h-12 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-zinc-950 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer">
          <Plus className="w-5 h-5" />
        </button>
        <button onClick={zoomOut} className="w-12 h-12 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-zinc-950 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer">
          <Minus className="w-5 h-5" />
        </button>
        <button onClick={recenter} className="w-12 h-12 bg-emerald-950/30 backdrop-blur-md border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-950/50 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer">
          <Compass className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
