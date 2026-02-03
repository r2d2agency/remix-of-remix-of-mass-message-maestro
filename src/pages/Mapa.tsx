import { useState, useMemo, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Building2, Users, Briefcase } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapData, MapLocation } from "@/hooks/use-map-data";

const TYPE_CONFIG = {
  deal: { label: "Negociações", color: "bg-blue-500", markerColor: "#3b82f6", icon: Briefcase },
  prospect: { label: "Prospects", color: "bg-orange-500", markerColor: "#f97316", icon: Users },
  company: { label: "Empresas", color: "bg-green-500", markerColor: "#22c55e", icon: Building2 },
};

// Create custom marker icon
const createIcon = (color: string) =>
  L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });

interface LeafletMapProps {
  locations: MapLocation[];
}

function LeafletMap({ locations }: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Initialize map
    mapRef.current = L.map(containerRef.current).setView([-14.235, -51.9253], 4);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    locations.forEach((location) => {
      const config = TYPE_CONFIG[location.type];
      const icon = createIcon(config.markerColor);

      const marker = L.marker([location.lat, location.lng], { icon }).addTo(mapRef.current!);

      const popupContent = `
        <div style="min-width: 150px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${config.markerColor};"></div>
            <span style="font-size: 12px; font-weight: 500; text-transform: uppercase; color: #666;">
              ${config.label}
            </span>
          </div>
          <p style="font-weight: 600; margin: 0;">${location.name}</p>
          ${location.phone ? `<p style="font-size: 14px; color: #666; margin: 4px 0;">${location.phone}</p>` : ""}
          ${location.city || location.state ? `<p style="font-size: 14px; color: #666; margin: 4px 0;">${[location.city, location.state].filter(Boolean).join(", ")}</p>` : ""}
          ${location.value !== undefined && location.value > 0 ? `<p style="font-size: 14px; font-weight: 500; color: #3b82f6; margin-top: 8px;">R$ ${location.value.toLocaleString("pt-BR")}</p>` : ""}
        </div>
      `;

      marker.bindPopup(popupContent);
      markersRef.current.push(marker);
    });
  }, [locations]);

  return <div ref={containerRef} className="h-full w-full relative z-0" style={{ minHeight: "500px" }} />;
}

export default function Mapa() {
  const { data: locations = [], isLoading } = useMapData();
  const [filters, setFilters] = useState({
    deal: true,
    prospect: true,
    company: true,
  });

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => filters[loc.type]);
  }, [locations, filters]);

  const stats = useMemo(() => ({
    deal: locations.filter((l) => l.type === "deal").length,
    prospect: locations.filter((l) => l.type === "prospect").length,
    company: locations.filter((l) => l.type === "company").length,
  }), [locations]);

  const toggleFilter = (type: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)] gap-3">
        {/* Header with Filters */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center shrink-0">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">Mapa de Localização</h1>
          </div>

          {/* Inline Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map((type) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              const isActive = filters[type];
              return (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
                  <Icon className="h-3.5 w-3.5" />
                  <span>{config.label}</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {stats[type]}
                  </Badge>
                </button>
              );
            })}
            <span className="text-xs text-muted-foreground ml-2">
              {filteredLocations.length} de {locations.length}
            </span>
          </div>
        </div>

        {/* Map - Full Height */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            {isLoading ? (
              <div className="h-full flex items-center justify-center min-h-[400px]">
                <Skeleton className="w-full h-full" />
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                <MapPin className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">Nenhuma localização encontrada</p>
                <p className="text-sm mt-2 max-w-md text-center">
                  Para visualizar dados no mapa, adicione cidade e/ou estado nos registros de 
                  Negociações, Prospects ou Empresas no CRM.
                </p>
              </div>
            ) : (
              <LeafletMap locations={filteredLocations} />
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
