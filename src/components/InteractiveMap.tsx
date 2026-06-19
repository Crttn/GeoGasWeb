import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { Minus, Plus, Compass, Sun, TrendingDown, Fuel } from 'lucide-react';
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
import { Style, Circle as CircleStyle, Fill, Stroke, Text, Icon } from 'ol/style';
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function InteractiveMap({
  city,
  selectedFuel,
  stations,
  selectedStation,
  onSelectStation,
  favorites,
  onMapMove
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<OLMap | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const lastVisibleIdsRef = useRef<Set<string>>(new Set());

  const MAX_MARKERS = 200;
  const VIEWPORT_BUFFER = 0.3;

  const [viewportStationIds, setViewportStationIds] = useState<string[]>([]);
  const [markersCapped, setMarkersCapped] = useState(false);

  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const onMapMoveRef = useRef(onMapMove);
  onMapMoveRef.current = onMapMove;
  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;
  const selectedStationIdRef = useRef<string | null>(null);
  selectedStationIdRef.current = selectedStation?.id || null;
  const hoveredFeatureIdRef = useRef<string | null>(null);

  const priceBounds = useMemo(() => {
    if (!selectedFuel) return null;
    const prices = stations.map(s => s.prices[selectedFuel]).filter(p => p !== undefined && p > 0);
    if (prices.length === 0) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [stations, selectedFuel]);

  const priceBoundsRef = useRef(priceBounds);
  priceBoundsRef.current = priceBounds;
  const selectedFuelRef = useRef(selectedFuel);
  selectedFuelRef.current = selectedFuel;

  const [hoveredStation, setHoveredStation] = useState<GasStation | null>(null);

  const [temp, setTemp] = useState<number>(city.id === 'sf' ? 62 : 21);
  useEffect(() => {
    setTemp(city.id === 'sf' ? 62 : 21);
  }, [city]);

  const averagePrice = useMemo(() => {
    if (selectedFuel === null) return 0;
    const validPrices = stations
      .map(s => s.prices[selectedFuel])
      .filter(p => p !== undefined);
    if (!validPrices.length) return 0;
    const sum = validPrices.reduce((a, b) => a + b, 0);
    return sum / validPrices.length;
  }, [stations, selectedFuel]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter = city.id === 'sf' ? [-122.4194, 37.7749] : [-3.7, 40.4];
    const initialZoom = city.id === 'sf' ? 13 : 6;

    const map = new OLMap({
      target: mapContainerRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            attributions: '© OpenStreetMap contributors © CARTO',
          }),
          className: 'dark-map-layer',
        }),
      ],
      view: new View({
        center: fromLonLat(initialCenter),
        zoom: initialZoom,
        maxZoom: 18,
        minZoom: 4,
      }),
      controls: [],
    });

    const vectorSource = new VectorSource();
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const station = feature.get('station') as GasStation;
        if (!station) return [];
        const isCluster = station.clusterCount !== undefined && station.clusterCount > 0;
        const isSelected = feature.getId() === selectedStationIdRef.current;
        const isHovered = feature.getId() === hoveredFeatureIdRef.current;

        const zoom = map.getView().getZoom() || 6;
        const fuel = selectedFuelRef.current;

        let tier: 'cheap' | 'medium' | 'expensive' | 'neutral' = 'neutral';
        const price = station.prices[fuel || ''];
        if (fuel && price !== undefined && priceBoundsRef.current) {
          const { min, max } = priceBoundsRef.current;
          const range = max - min;
          if (range > 0) {
            const ratio = (price - min) / range;
            if (ratio < 0.33) tier = 'cheap';
            else if (ratio < 0.66) tier = 'medium';
            else tier = 'expensive';
          } else {
            tier = 'cheap';
          }
        }

        const styles: Style[] = [];

        if (isSelected) {
          styles.push(new Style({
            image: new CircleStyle({
              radius: isCluster ? 28 : 16,
              stroke: new Stroke({ color: '#10b981', width: 2, lineDash: [4, 4] }),
              fill: new Fill({ color: 'rgba(16, 185, 129, 0.05)' })
            })
          }));
        }

        if (isCluster) {
          let fillCol = 'rgba(6, 78, 59, 0.85)';
          let strokeCol = '#10b981';
          let textCol = '#34d399';

          if (tier === 'cheap') {
            fillCol = 'rgba(20, 83, 45, 0.85)';
            strokeCol = '#22c55e';
            textCol = '#4ade80';
          } else if (tier === 'medium') {
            fillCol = 'rgba(120, 53, 4, 0.85)';
            strokeCol = '#f59e0b';
            textCol = '#fbbf24';
          } else if (tier === 'expensive') {
            fillCol = 'rgba(127, 29, 29, 0.85)';
            strokeCol = '#ef4444';
            textCol = '#f87171';
          }

          const baseRadius = zoom >= 9 ? 22 : 18;
          const finalRadius = isHovered ? baseRadius + 3 : baseRadius;

          styles.push(new Style({
            image: new CircleStyle({
              radius: finalRadius,
              fill: new Fill({ color: fillCol }),
              stroke: new Stroke({ color: strokeCol, width: isHovered ? 3 : 2 })
            }),
            text: new Text({
              text: station.clusterCount?.toString() || '',
              fill: new Fill({ color: textCol }),
              font: `bold ${finalRadius - 6}px sans-serif`
            })
          }));
        } else {
          let fillCol = '#10b981';
          let strokeCol = '#047857';

          if (tier === 'cheap') {
            fillCol = '#22c55e';
            strokeCol = '#15803d';
          } else if (tier === 'medium') {
            fillCol = '#eab308';
            strokeCol = '#a16207';
          } else if (tier === 'expensive') {
            fillCol = '#ef4444';
            strokeCol = '#b91c1c';
          }

          let radius = zoom >= 15 ? 10 : (zoom >= 13 ? 7 : 5);
          if (isHovered) radius += 3;

          styles.push(new Style({
            image: new CircleStyle({
              radius: radius,
              fill: new Fill({ color: fillCol }),
              stroke: new Stroke({ color: strokeCol, width: isHovered ? 2.5 : 1.5 })
            })
          }));

          if (zoom >= 15) {
            styles.push(new Style({
              image: new CircleStyle({
                radius: 3,
                fill: new Fill({ color: '#ffffff' })
              })
            }));
          }
        }

        return styles;
      }
    });

    map.addLayer(vectorLayer);
    vectorSourceRef.current = vectorSource;
    vectorLayerRef.current = vectorLayer;

    mapInstanceRef.current = map;

    map.on('click', (event) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (feat) => feat);
      if (feature) {
        const station = feature.get('station') as GasStation;
        if (station && onSelectStationRef.current) {
          onSelectStationRef.current(station);
        }
      }
    });

    map.on('pointermove', (event) => {
      if (event.dragging) return;
      const pixel = map.getEventPixel(event.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (feat) => feat);

      const lastHoveredId = hoveredFeatureIdRef.current;
      const currentHoveredId = feature ? feature.getId() as string : null;

      if (lastHoveredId !== currentHoveredId) {
        hoveredFeatureIdRef.current = currentHoveredId;
        vectorLayer.changed();
      }

      if (feature) {
        const station = feature.get('station') as GasStation;
        setHoveredStation(station || null);
        map.getTargetElement().style.cursor = 'pointer';
      } else {
        setHoveredStation(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.updateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.setTarget(undefined);
      mapInstanceRef.current = null;
      vectorSourceRef.current = null;
      vectorLayerRef.current = null;
    };
  }, [city.id]);

  const updateVisibleRef = useRef<() => void>(() => {});

  const [clusterMarkers, setClusterMarkers] = useState<GasStation[]>([]);

  const groupAndCluster = (stations: GasStation[], groupKey: (s: GasStation) => string, labelKey: (s: GasStation) => string, cLat: number, cLon: number) => {
    const groups = new Map<string, GasStation[]>();
    stations.forEach(s => {
      const key = groupKey(s);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    });
    const markers: GasStation[] = [];
    groups.forEach((group, key) => {
      const avgLat = group.reduce((sum, s) => sum + s.latitude, 0) / group.length;
      const avgLon = group.reduce((sum, s) => sum + s.longitude, 0) / group.length;
      const distKm = haversineKm(cLat, cLon, avgLat, avgLon);

      const clusterPrices: Record<string, number> = {};
      city.fuelTypes.forEach(ft => {
        const prices = group.map(s => s.prices[ft.id]).filter(p => p !== undefined);
        if (prices.length > 0) {
          clusterPrices[ft.id] = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
      });

      markers.push({
        id: `cluster-${key}`,
        name: labelKey(group[0]),
        brand: 'generic',
        address: `${group.length} gasolineras`,
        municipality: labelKey(group[0]),
        distance: distKm,
        latitude: avgLat,
        longitude: avgLon,
        prices: clusterPrices,
        isOpen: true,
        hours: '',
        clusterCount: group.length,
        clusterChildIds: group.map(s => s.id),
      });
    });
    return markers;
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateVisibleStations = () => {
      const size = map.getSize();
      if (!size) return;

      const view = map.getView();
      const extent = view.calculateExtent(size);
      const zoom = view.getZoom() || 6;

      const center = view.getCenter();
      let mapCenterLat = 40.4168;
      let mapCenterLon = -3.7038;
      if (center) {
        const [lon, lat] = toLonLat(center);
        mapCenterLat = lat;
        mapCenterLon = lon;
        if (onMapMoveRef.current) {
          onMapMoveRef.current({ lat, lon });
        }
      }

      const currentStations = stationsRef.current;

      const width = extent[2] - extent[0];
      const height = extent[3] - extent[1];
      const bufX = width * VIEWPORT_BUFFER;
      const bufY = height * VIEWPORT_BUFFER;
      const buffered = [
        extent[0] - bufX, extent[1] - bufY,
        extent[2] + bufX, extent[3] + bufY,
      ];

      let visible = currentStations.filter(station => {
        const coord = fromLonLat([station.longitude, station.latitude]);
        return coord[0] >= buffered[0] && coord[0] <= buffered[2] &&
               coord[1] >= buffered[1] && coord[1] <= buffered[3];
      });

      let newIds: string[];
      let newClusters: GasStation[] = [];

      if (zoom < 8) {
        setMarkersCapped(false);
        const clusters = groupAndCluster(visible, s => s.provinciaId || 'unknown', s => s.provinciaNombre || s.municipality, mapCenterLat, mapCenterLon);
        newClusters = clusters;
        newIds = clusters.map(c => c.id);
      } else if (zoom < 11) {
        setMarkersCapped(false);
        const clusters = groupAndCluster(visible, s => `${s.municipality}-${s.provinciaId || ''}`, s => s.municipality, mapCenterLat, mapCenterLon);
        newClusters = clusters;
        newIds = clusters.map(c => c.id);
      } else {
        const capped = visible.length > MAX_MARKERS;
        setMarkersCapped(capped);
        if (capped) visible = visible.slice(0, MAX_MARKERS);
        newIds = visible.map(s => s.id);
      }

      const newSet = new Set(newIds);
      const prevSet = lastVisibleIdsRef.current;

      const changed = newIds.length !== prevSet.size || newIds.some(id => !prevSet.has(id));
      if (changed) {
        lastVisibleIdsRef.current = newSet;
        setViewportStationIds(newIds);
        setClusterMarkers(newClusters);
      }
    };

    updateVisibleRef.current = updateVisibleStations;

    updateVisibleStations();
    const t = setTimeout(updateVisibleStations, 100);
    map.on('moveend', updateVisibleStations);
    return () => {
      clearTimeout(t);
      map.un('moveend', updateVisibleStations);
    };
  }, [city.id]);

  const stationsKey = useMemo(() => {
    return stations.length + ':' + stations.slice(0, 50).map(s => s.id).join(',');
  }, [stations]);

  useEffect(() => {
    if (stations.length > 0) {
      const t = setTimeout(() => updateVisibleRef.current(), 50);
      return () => clearTimeout(t);
    }
  }, [stationsKey, city.id]);

  useEffect(() => {
    vectorLayerRef.current?.changed();
  }, [selectedStation?.id]);

  useLayoutEffect(() => {
    const source = vectorSourceRef.current;
    if (!source) return;

    source.clear();

    const stationMap = new Map<string, GasStation>(stations.map(s => [s.id, s]));
    const clusterMap = new Map<string, GasStation>(clusterMarkers.map(c => [c.id, c]));

    const features: Feature[] = [];

    viewportStationIds.forEach(id => {
      const station = clusterMap.get(id) || stationMap.get(id);
      if (!station) return;

      const isCluster = station.clusterCount !== undefined && station.clusterCount > 0;
      if (!isCluster && selectedFuel !== null && station.prices[selectedFuel] === undefined) {
        return;
      }

      const feature = new Feature({
        geometry: new Point(fromLonLat([station.longitude, station.latitude])),
      });
      feature.setId(station.id);
      feature.set('station', station);
      features.push(feature);
    });

    source.addFeatures(features);
  }, [viewportStationIds, clusterMarkers, stationsKey, selectedFuel]);

  const skipAutoPan = useRef(false);

  const viewportVisibleIds = viewportStationIds;

  useEffect(() => {
    if (selectedStation && mapInstanceRef.current && !skipAutoPan.current) {
      const isCluster = selectedStation.clusterCount !== undefined && selectedStation.clusterCount > 0;
      const view = mapInstanceRef.current.getView();
      const currentZoom = view.getZoom() || 6;
      let targetZoom: number;
      if (isCluster) {
        targetZoom = currentZoom < 8 ? 10 : 13;
      } else {
        targetZoom = city.id === 'sf' ? 16 : 15;
      }
      view.animate({
        center: fromLonLat([selectedStation.longitude, selectedStation.latitude]),
        zoom: targetZoom,
        duration: 800
      });
    }
    skipAutoPan.current = false;
  }, [selectedStation, city.id]);

  const handleZoomIn = useCallback(() => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({ zoom: (view.getZoom() || 0) + 0.5, duration: 200 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (mapInstanceRef.current) {
      const view = mapInstanceRef.current.getView();
      view.animate({ zoom: (view.getZoom() || 0) - 0.5, duration: 200 });
    }
  }, []);

  const handleRecenter = useCallback(() => {
    if (mapInstanceRef.current) {
      const center = city.id === 'sf' ? [-122.4194, 37.7749] : [-3.7038, 40.4168];
      const zoom = city.id === 'sf' ? 13 : 6;
      mapInstanceRef.current.getView().animate({
        center: fromLonLat(center),
        zoom: zoom,
        duration: 800
      });
    }
  }, [city.id]);

  return (
    <div className="relative w-full h-full bg-[#080d0a]">
      <style>{`
        .dark-map-layer .ol-layer {
          filter: brightness(0.68) contrast(1.22) saturate(0.8) !important;
        }
        .ol-viewport {
          position: absolute;
          width: 100%;
          height: 100%;
        }
      `}</style>

      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500 via-transparent to-transparent bg-[size:20px_20px] bg-[linear-gradient(to_right,#10b981_1px,transparent_1px),linear-gradient(to_bottom,#10b981_1px,transparent_1px)]" />

      {hoveredStation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 backdrop-blur-md border border-zinc-700 px-5 py-3 rounded-2xl shadow-2xl min-w-[300px] max-w-[90%] pointer-events-none transition-all duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold text-zinc-100 truncate">
                  {hoveredStation.name}
                </p>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                  {hoveredStation.distance.toFixed(1)} {city.id === 'sf' ? 'mi' : 'km'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {hoveredStation.address}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${hoveredStation.isOpen ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className={`text-[10px] font-semibold ${hoveredStation.isOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {hoveredStation.isOpen
                    ? (city.id === 'sf' ? 'Open' : 'Abierto')
                    : (city.id === 'sf' ? 'Closed' : 'Cerrado')
                  }
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
                <React.Fragment key={ft.id}>
                  {idx > 0 && <span className="text-zinc-700 text-[14px] font-light mx-2">|</span>}
                  <div className="text-center">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{ft.label}</p>
                    <p className="text-[15px] font-bold text-emerald-400 font-data-display leading-none mt-0.5">
                      {city.currency}{p.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}
                    </p>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <div className="map-controls-prevent absolute bottom-4 left-4 flex flex-wrap items-center gap-2 p-3 md:p-4 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl select-none text-[13px] md:text-body-sm font-medium z-10">
        <div className="flex items-center gap-2 text-zinc-300">
          <Sun className="w-4 h-4 text-emerald-400 animate-spinOriginal slow" />
          <span className="font-semibold text-zinc-100">
            {temp}°{city.id === 'sf' ? 'F' : 'C'}
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-400 font-normal">
            {city.id === 'sf' ? 'Sunny' : 'Despejado'}
          </span>
        </div>
        
        <div className="hidden sm:block h-4 w-px bg-white/10 mx-2" />

        <div className="flex items-center gap-1.5 text-emerald-400">
          <TrendingDown className="w-4 h-4" />
          <span className="text-zinc-400 font-normal">
            {city.id === 'sf' ? 'Market Avg:' : 'Precio Medio:'}
          </span>
          <span className="font-semibold font-data-display">
            {city.currency}
            {averagePrice.toFixed(3).replace('.', city.id === 'spain' ? ',' : '.')}
            {city.id === 'spain' ? ' / L' : ' / gal'}
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

      {markersCapped && (
        <div className="absolute top-24 right-4 z-10 bg-amber-950/80 border border-amber-500/30 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg text-[10px] font-bold tracking-wider text-amber-400">
          {city.id === 'sf' ? `Showing ${MAX_MARKERS} of ${stations.length} stations` : `Mostrando ${MAX_MARKERS} de ${stations.length} gasolineras`}
        </div>
      )}

      <div className="map-controls-prevent absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={handleZoomIn}
          className="w-12 h-12 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-zinc-950 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer"
          title="Zoom In"
          id="map-zoom-in"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-12 h-12 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-zinc-950 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer"
          title="Zoom Out"
          id="map-zoom-out"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          onClick={handleRecenter}
          className="w-12 h-12 bg-emerald-950/30 backdrop-blur-md border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-950/50 transition-all duration-200 shadow-lg active:scale-90 cursor-pointer"
          title="Recenter Map"
          id="map-recenter"
        >
          <Compass className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
