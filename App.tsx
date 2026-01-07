import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  RoutePoint,
  DriverCost,
  PricingParams,
  PricingResult,
  VehicleType,
} from "./types";
import {
  parseCSV,
  parseValoresCSV,
  smoothRoute,
  getRouteColor,
  naturalRouteSort,
} from "./utils";
import { calculatePriceEnterprise } from "./pricingEngine";

const L = (window as any).L;
const ALL_VALUE = "__ALL__";
const DEFAULT_ROUTE_VEHICLE: VehicleType = "carro";

const createTeardropIcon = (
  color: string,
  label: string,
  isCluster: boolean = false
) => {
  const size = isCluster ? 46 : 38;
  const fontSize = label.length > 4 ? "7px" : "9px";
  return L.divIcon({
    className: "custom-div-icon",
    html: `
      <div class="custom-pin-wrapper" style="width: ${size}px; height: ${size}px;">
        <div class="teardrop" style="--pin-color: ${color}; width: ${size}px; height: ${size}px;">
          <div class="teardrop-inner" style="width: ${size - 12}px; height: ${
      size - 12
    }px; font-size: ${fontSize}; line-height: 1; text-align: center;">
            ${label}
          </div>
        </div>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

type SortKey = "nome" | "faturamento" | "pacotes" | "paradas" | "distancia";

const App: React.FC = () => {
  const [data, setData] = useState<RoutePoint[]>([]);
  const [driverCosts, setDriverCosts] = useState<DriverCost[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>(ALL_VALUE);
  const [selectedRoute, setSelectedRoute] = useState<string>(ALL_VALUE);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isValoresPanelOpen, setIsValoresPanelOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isRouteHighlightActive, setIsRouteHighlightActive] = useState(false);

  // Estados de ordenação - Tabela Real
  const [sortKey, setSortKey] = useState<SortKey>("faturamento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Estados de ordenação - Tabela Pro (Sugerido)
  const [proSortKey, setProSortKey] = useState<SortKey>("faturamento");
  const [proSortDir, setProSortDir] = useState<"asc" | "desc">("desc");

  const [pricingParams, setPricingParams] = useState<PricingParams>({
    vehicle: "carro",
    traffic: "MODERADO",
    climate: "CEU_LIMPO",
    sla: "NORMAL",
    risk: "BAIXO",
    pedidos: 100,
    motoristas: 100,
    pricePerKg: 0.15,
    pricePerM3: 0.1,
    packagePrice300g: 3,
  });
  const [routeVehicles, setRouteVehicles] = useState<
    Record<string, VehicleType>
  >({});

  const updatePricingParam = useCallback(
    <K extends keyof PricingParams>(key: K, value: PricingParams[K]) => {
      setPricingParams((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const mapLRef = useRef<any>(null);
  const mapRRef = useRef<any>(null);
  const sideLGroupRef = useRef<any>(L.layerGroup());
  const sideRGroupRef = useRef<any>(L.layerGroup());
  const proPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const [rRotas, rValores] = await Promise.all([
        fetch("rotas.csv").then((res) => res.text()),
        fetch("valores.csv").then((res) => res.text()),
      ]);
      setData(parseCSV(rRotas).data);
      setDriverCosts(parseValoresCSV(rValores));
    };
    load();
  }, []);

  const routeNames = useMemo(
    () =>
      Array.from(new Set(data.map((d) => d.routeName))).sort(naturalRouteSort),
    [data]
  );

  const driverMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data.forEach((p) => {
      if (p.nome && p.nome !== "undefined" && p.cafid) {
        if (!map.has(p.nome)) map.set(p.nome, new Set());
        map.get(p.nome)!.add(String(p.cafid).trim());
      }
    });
    return map;
  }, [data]);

  const driverList = useMemo(
    () => Array.from(driverMap.keys()).sort((a, b) => a.localeCompare(b)),
    [driverMap]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleSortPro = (key: SortKey) => {
    if (proSortKey === key) {
      setProSortDir(proSortDir === "asc" ? "desc" : "asc");
    } else {
      setProSortKey(key);
      setProSortDir("desc");
    }
  };

  const allDriversSummary = useMemo(() => {
    const summary = driverList.map((name) => {
      const targetCafIDs = driverMap.get(name);
      const matches = driverCosts.filter((c) =>
        targetCafIDs?.has(String(c.CafID).trim())
      );
      const faturamento = matches.reduce(
        (sum, curr) => sum + (curr.ValorTotal || 0),
        0
      );

      const driverPoints = data.filter((p) => p.nome === name);
      const pacotes = driverPoints.length;
      const paradas = new Set(
        driverPoints.map((p) => `${p.lat.toFixed(6)},${p.long.toFixed(6)}`)
      ).size;

      return {
        nome: name,
        faturamento,
        pacotes,
        paradas,
      };
    });

    return summary.sort((a, b) => {
      const multiplier = sortDir === "asc" ? 1 : -1;
      if (sortKey === "nome") return multiplier * a.nome.localeCompare(b.nome);
      return multiplier * (a[sortKey] - b[sortKey]);
    });
  }, [driverList, driverMap, driverCosts, data, sortKey, sortDir]);

  const allRoutesSummaryPro = useMemo(() => {
    const summary = routeNames.map((name) => {
      const pts = data.filter((p) => p.routeName === name);
      const uniqueStops = new Set(
        pts.map((p) => `${p.lat.toFixed(6)},${p.long.toFixed(6)}`)
      ).size;
      const distKm =
        pts[0].distancia_dentro_rota_km + pts[0].distancia_primeiro_ponto_km;
      const totalPesoKg = pts.reduce((sum, p) => sum + (p.peso_kg || 0), 0);
      const totalVolumeM3 =
        pts.reduce((sum, p) => sum + (p.volume_cm3 || 0), 0) / 1_000_000;
      const vehicle = routeVehicles[name] ?? DEFAULT_ROUTE_VEHICLE;
      const pricing = calculatePriceEnterprise(
        distKm,
        { ...pricingParams, vehicle },
        pts.length,
        uniqueStops,
        totalPesoKg,
        totalVolumeM3
      );
      return {
        nome: name,
        vehicle,
        faturamento: pricing,
        pacotes: pts.length,
        paradas: uniqueStops,
        distancia: distKm,
        pesoKg: totalPesoKg,
        volumeM3: totalVolumeM3,
      };
    });

    return summary.sort((a, b) => {
      const multiplier = proSortDir === "asc" ? 1 : -1;
      if (proSortKey === "nome")
        return multiplier * naturalRouteSort(a.nome, b.nome);
      return multiplier * (a[proSortKey] - b[proSortKey]);
    });
  }, [routeNames, data, pricingParams, proSortKey, proSortDir, routeVehicles]);

  const activeDriverStats = useMemo(() => {
    const filtered =
      selectedDriver === ALL_VALUE
        ? data
        : data.filter((p) => p.nome === selectedDriver);

    if (!filtered.length) {
      return null;
    }

    let motoristas_agrupados = {};
    let uniqueStops = 0;
    filtered.forEach((item) => {
      if (item.nome in motoristas_agrupados) {
        motoristas_agrupados[item.nome].pontos.push(item);
      } else {
        motoristas_agrupados[item.nome] = {
          pontos: [item],
        };
      }
    });

    for (let key in motoristas_agrupados) {
      uniqueStops += new Set(
        motoristas_agrupados[key].pontos.map(
          (p) => `${p.lat.toFixed(6)},${p.long.toFixed(6)}`
        )
      ).size;
    }

    return {
      totalPackages: filtered.length,
      uniqueStops: uniqueStops,
    };
  }, [data, selectedDriver]);

  const operationPricingTotal = useMemo(() => {
    return routeNames.reduce(
      (total, name) => {
        const pts = data.filter((p) => p.routeName === name);
        const uniqueStops = new Set(pts.map((p) => `${p.lat},${p.long}`)).size;
        const distKm =
          pts[0].distancia_dentro_rota_km + pts[0].distancia_primeiro_ponto_km;
        const totalPesoKg = pts.reduce((sum, p) => sum + (p.peso_kg || 0), 0);
        const totalVolumeM3 =
          pts.reduce((sum, p) => sum + (p.volume_cm3 || 0), 0) / 1_000_000;
        const vehicle = routeVehicles[name] ?? DEFAULT_ROUTE_VEHICLE;

        const pricing = calculatePriceEnterprise(
          distKm,
          { ...pricingParams, vehicle },
          pts.length,
          uniqueStops,
          totalPesoKg,
          totalVolumeM3
        );
        return {
          valorTotal: total?.valorTotal + pricing.finalPrice,
          paradasUnicas: total?.paradasUnicas + uniqueStops,
          totalEncomendas: total?.totalEncomendas + pts.length,
          distanciaTotal: total?.distanciaTotal + distKm,
          pesoTotalKg: total?.pesoTotalKg + totalPesoKg,
          volumeTotalM3: total?.volumeTotalM3 + totalVolumeM3,
        };
      },
      {
        valorTotal: 0,
        paradasUnicas: 0,
        totalEncomendas: 0,
        distanciaTotal: 0,
        pesoTotalKg: 0,
        volumeTotalM3: 0,
      }
    );
  }, [data, routeNames, pricingParams, routeVehicles]);

  const activeDriverData = useMemo(() => {
    let matches: DriverCost[] = [];

    if (selectedDriver === ALL_VALUE) {
      matches = driverCosts;
    } else {
      const targetCafIDs = driverMap.get(selectedDriver);
      if (!targetCafIDs) return null;
      matches = driverCosts.filter((c) =>
        targetCafIDs.has(String(c.CafID).trim())
      );
    }

    if (matches.length === 0) return null;

    return matches.reduce(
      (acc, curr) => ({
        ...acc,
        ValorTotal: acc.ValorTotal + (curr.ValorTotal || 0),
        ValorDiariaFixa: acc.ValorDiariaFixa + (curr.ValorDiariaFixa || 0),
        ValorMenor_300Gr:
          (acc.ValorMenor_300Gr || 0) + (curr.ValorMenor_300Gr || 0),
        ValorMaior_300Gr:
          (acc.ValorMaior_300Gr || 0) + (curr.ValorMaior_300Gr || 0),
        ValorMaior_10k: (acc.ValorMaior_10k || 0) + (curr.ValorMaior_10k || 0),
        ValorMaior_20k: (acc.ValorMaior_20k || 0) + (curr.ValorMaior_20k || 0),
        ValorAdicional: (acc.ValorAdicional || 0) + (curr.ValorAdicional || 0),
      }),
      {
        mot_nome:
          selectedDriver === ALL_VALUE ? "OPERAÇÃO TOTAL" : selectedDriver,
        CafID:
          selectedDriver === ALL_VALUE
            ? "MÚLTIPLOS"
            : Array.from(driverMap.get(selectedDriver) || []).join(", "),
        ValorTotal: 0,
        ValorDiariaFixa: 0,
        ValorMenor_300Gr: 0,
        ValorMaior_300Gr: 0,
        ValorMaior_10k: 0,
        ValorMaior_20k: 0,
        ValorAdicional: 0,
      } as any
    );
  }, [driverCosts, selectedDriver, driverMap]);

  const auditData = useMemo(() => {
    if (selectedRoute === ALL_VALUE) return null;
    const plannedPts = data.filter((p) => p.routeName === selectedRoute);
    const plannedUniqueStops = new Set(
      plannedPts.map((p) => `${p.lat.toFixed(5)},${p.long.toFixed(5)}`)
    ).size;

    const plannedDist =
      plannedPts[0].distancia_dentro_rota_km +
      plannedPts[0].distancia_primeiro_ponto_km;
    const plannedPesoKg = plannedPts.reduce(
      (sum, p) => sum + (p.peso_kg || 0),
      0
    );
    const plannedVolumeM3 =
      plannedPts.reduce((sum, p) => sum + (p.volume_cm3 || 0), 0) / 1_000_000;
    const vehicle = routeVehicles[selectedRoute] ?? DEFAULT_ROUTE_VEHICLE;
    const plannedPricing = calculatePriceEnterprise(
      plannedDist,
      { ...pricingParams, vehicle },
      plannedPts.length,
      plannedUniqueStops,
      plannedPesoKg,
      plannedVolumeM3
    );

    return {
      routeName: selectedRoute,
      plannedStops: plannedUniqueStops,
      totalPackages: plannedPts.length,
      plannedAddition: plannedPricing.multiPackageAddition,
      plannedTotal: plannedPricing.finalPrice,
      efficiency: plannedUniqueStops / plannedPts.length,
    };
  }, [data, selectedRoute, pricingParams, routeVehicles]);

  const updateSide = useCallback(
    (
      mainGroup: any,
      type: "driver" | "route",
      val: string,
      isProcessed: boolean
    ) => {
      if (!mainGroup) return [];
      mainGroup.clearLayers();

      let displayPts =
        val === ALL_VALUE
          ? data
          : data.filter((p) =>
              type === "driver" ? p.nome === val : p.routeName === val
            );

      if (!displayPts.length) return [];

      const isDriverView = type === "driver";
      const uniqueRoutesInView = Array.from(
        new Set(displayPts.map((p) => p.routeName))
      ) as string[];

      const coordCounts = new Map<string, number>();
      if (isDriverView) {
        displayPts.forEach((p) => {
          const key = `${p.lat.toFixed(6)},${p.long.toFixed(6)}`;
          coordCounts.set(key, (coordCounts.get(key) || 0) + 1);
        });
      }

      uniqueRoutesInView.forEach((routeName) => {
        let routePts = displayPts.filter((p) => p.routeName === routeName);
        const color =
          val === ALL_VALUE ? getRouteColor(routeName, routeNames) : "#6366f1";
        const linePts = isProcessed ? smoothRoute(routePts) : routePts;

        L.polyline(
          linePts.map((p) => [p.lat, p.long]),
          {
            color,
            weight: val === ALL_VALUE ? 2 : 4,
            opacity: val === ALL_VALUE ? 0.4 : 0.8,
            dashArray: isProcessed ? "10,10" : "",
          }
        ).addTo(mainGroup);

        const routeCluster = L.markerClusterGroup({
          maxClusterRadius: 40,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (cluster: any) => {
            const markers = cluster.getAllChildMarkers();
            if (isDriverView) {
              return createTeardropIcon(
                color,
                markers.length > 1 ? String(markers.length) : "",
                true
              );
            }
            const orders = markers
              .map((m: any) => m.options.orderNum)
              .sort((a: number, b: number) => a - b);
            const range =
              orders.length > 1
                ? `${orders[0]}~${orders[orders.length - 1]}`
                : `${orders[0]}`;
            return createTeardropIcon(color, range, true);
          },
        });

        const processedCoords = new Set<string>();

        routePts.forEach((p) => {
          const coordKey = `${p.lat.toFixed(6)},${p.long.toFixed(6)}`;

          if (isDriverView && processedCoords.has(coordKey)) return;
          processedCoords.add(coordKey);

          const myFullRoute = data.filter((pt) => pt.routeName === p.routeName);
          const uniqueStops = new Set(
            myFullRoute.map((pt) => `${pt.lat},${pt.long}`)
          ).size;
          const totalPesoKg = myFullRoute.reduce(
            (sum, pt) => sum + (pt.peso_kg || 0),
            0
          );
          const totalVolumeM3 =
            myFullRoute.reduce((sum, pt) => sum + (pt.volume_cm3 || 0), 0) /
            1_000_000;

          const distKm =
            myFullRoute[0].distancia_dentro_rota_km +
            myFullRoute[0].distancia_primeiro_ponto_km;
          const routeVehicle =
            routeVehicles[p.routeName] ?? DEFAULT_ROUTE_VEHICLE;

          const pricing = calculatePriceEnterprise(
            distKm,
            { ...pricingParams, vehicle: routeVehicle },
            myFullRoute.length,
            uniqueStops,
            totalPesoKg,
            totalVolumeM3
          );

          const displayPrice =
            isDriverView && val !== ALL_VALUE && activeDriverData
              ? activeDriverData.ValorTotal
              : pricing.finalPrice;

          const labelPrice =
            isDriverView && val !== ALL_VALUE
              ? "Faturamento Real Consolidado"
              : isDriverView
              ? `Condutor: ${p.nome}`
              : `Roteiro: ${p.routeName}`;

          const driverPackagesTotal = data.filter(
            (pt) => pt.nome === p.nome
          ).length;
          const packagesAtThisPoint = coordCounts.get(coordKey) || 1;
          const firstName = p.nome?.split(" ")[0] || "";

          const markerLabel = isDriverView
            ? `${firstName.substring(0, 3)}${
                packagesAtThisPoint > 1 ? `(${packagesAtThisPoint})` : ""
              }`
            : String(p.order);

          const marker = L.marker([p.lat, p.long], {
            orderNum: p.order,
            markerColor: color,
            icon: createTeardropIcon(color, markerLabel),
          }).bindPopup(`
          <div class="p-1 bg-white text-slate-900 min-width-[220px]">
            <div class="text-[10px] font-black uppercase text-slate-400 mb-1">${labelPrice}</div>
            <div class="text-xl font-black text-indigo-600 leading-tight">R$ ${displayPrice.toFixed(
              2
            )}</div>
            <div class="text-[9px] font-mono text-slate-400 mb-2">${p.lat.toFixed(
              5
            )}, ${p.long.toFixed(5)}</div>
            <div class="text-[11px] space-y-1 border-t pt-3">
               ${
                 isDriverView
                   ? ""
                   : `<div class="flex justify-between"><span>Distância:</span> <b>${distKm.toFixed(
                       1
                     )}km</b></div>`
               }
               <div class="flex justify-between"><span>${
                 isDriverView ? "Entregas neste ponto:" : "Paradas:"
               }</span> <b>${
            isDriverView ? packagesAtThisPoint : uniqueStops
          }</b></div>
               <div class="flex justify-between"><span>${
                 isDriverView ? "Total de pacotes na rota:" : "Pacotes:"
               }</span> <b>${
            isDriverView ? driverPackagesTotal : myFullRoute.length
          }</b></div>
               ${
                 isDriverView && packagesAtThisPoint > 1
                   ? `<div class="mt-2 text-indigo-600 font-bold">Concentração: ${packagesAtThisPoint} pacotes</div>`
                   : ""
               }
            </div>
            ${
              isDriverView
                ? ""
                : `<button id="pop-audit-${p.awb}" class="mt-4 w-full bg-slate-900 text-white text-[10px] font-black py-3 rounded-xl uppercase hover:bg-indigo-600 transition-colors">Ver Comparativo</button>`
            }
          </div>
        `);

          if (!isDriverView) {
            marker.on("popupopen", () => {
              document
                .getElementById(`pop-audit-${p.awb}`)
                ?.addEventListener("click", () => {
                  setSelectedRoute(p.routeName);
                  setIsAuditModalOpen(true);
                });
            });
          }

          routeCluster.addLayer(marker);
        });
        routeCluster.addTo(mainGroup);
      });
      return displayPts;
    },
    [data, routeNames, pricingParams, activeDriverData, routeVehicles]
  );

  useEffect(() => {
    setRouteVehicles((prev) => {
      const next = { ...prev };
      routeNames.forEach((routeName) => {
        if (!next[routeName]) {
          next[routeName] = DEFAULT_ROUTE_VEHICLE;
        }
      });
      return next;
    });
  }, [routeNames]);

  useEffect(() => {
    const leftPts = updateSide(
      sideLGroupRef.current,
      "driver",
      selectedDriver,
      false
    );
    const rightPts = updateSide(
      sideRGroupRef.current,
      "route",
      selectedRoute,
      true
    );
    if (leftPts.length)
      mapLRef.current.fitBounds(
        L.latLngBounds(leftPts.map((p) => [p.lat, p.long])),
        { padding: [80, 80] }
      );
    if (rightPts.length)
      mapRRef.current.fitBounds(
        L.latLngBounds(rightPts.map((p) => [p.lat, p.long])),
        { padding: [80, 80] }
    );
  }, [selectedDriver, selectedRoute, updateSide]);

  useEffect(() => {
    if (selectedRoute === ALL_VALUE) return;
    proPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setIsRouteHighlightActive(true);
    const timer = window.setTimeout(() => {
      setIsRouteHighlightActive(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [selectedRoute]);

  useEffect(() => {
    if (mapLRef.current) return;
    const initMap = (id: string, group: any) => {
      const m = L.map(id, {
        zoomControl: false,
        attributionControl: false,
        maxZoom: 18,
      }).setView([-23.51, -46.83], 12);
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      ).addTo(m);
      group.addTo(m);
      return m;
    };
    mapLRef.current = initMap("map-left", sideLGroupRef.current);
    mapRRef.current = initMap("map-right", sideRGroupRef.current);
  }, []);

  const SortIcon = ({
    active,
    dir,
  }: {
    active: boolean;
    dir: "asc" | "desc";
  }) => {
    if (!active)
      return (
        <svg
          className="w-2.5 h-2.5 ml-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M7 14l5-5 5 5H7z" />
        </svg>
      );
    return (
      <svg
        className={`w-2.5 h-2.5 ml-1 text-indigo-400 transition-transform ${
          dir === "asc" ? "" : "rotate-180"
        }`}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M7 14l5-5 5 5H7z" />
      </svg>
    );
  };

  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value),
    []
  );

  const proSelection = useMemo(() => {
    if (!data.length) return null;
    if (selectedRoute !== ALL_VALUE) {
      const pts = data.filter((p) => p.routeName === selectedRoute);
      if (!pts.length) return null;
      const uniqueStops = new Set(pts.map((p) => `${p.lat},${p.long}`)).size;
      const totalPesoKg = pts.reduce((sum, p) => sum + (p.peso_kg || 0), 0);
      const totalVolumeM3 =
        pts.reduce((sum, p) => sum + (p.volume_cm3 || 0), 0) / 1_000_000;
      const distKm =
        pts[0].distancia_dentro_rota_km + pts[0].distancia_primeiro_ponto_km;
      const vehicle = routeVehicles[selectedRoute] ?? DEFAULT_ROUTE_VEHICLE;
      const pricing = calculatePriceEnterprise(
        distKm,
        { ...pricingParams, vehicle },
        pts.length,
        uniqueStops,
        totalPesoKg,
        totalVolumeM3
      );
      return {
        label: `Projeção: ${selectedRoute}`,
        distKm,
        pacotes: pts.length,
        paradas: uniqueStops,
        pesoKg: totalPesoKg,
        volumeM3: totalVolumeM3,
        pricing,
      };
    }

    const distKm = operationPricingTotal?.distanciaTotal || 0;
    const totalPesoKg = operationPricingTotal?.pesoTotalKg || 0;
    const totalVolumeM3 = operationPricingTotal?.volumeTotalM3 || 0;
    const pacotes = operationPricingTotal?.totalEncomendas || 0;
    const paradas = operationPricingTotal?.paradasUnicas || 0;
    const pricing = calculatePriceEnterprise(
      distKm,
      { ...pricingParams, vehicle: DEFAULT_ROUTE_VEHICLE },
      pacotes,
      paradas,
      totalPesoKg,
      totalVolumeM3
    );
    return {
      label: "Total Projetado (Operação)",
      distKm,
      pacotes,
      paradas,
      pesoKg: totalPesoKg,
      volumeM3: totalVolumeM3,
      pricing,
    };
  }, [
    data,
    selectedRoute,
    routeVehicles,
    pricingParams,
    operationPricingTotal,
  ]);

  return (
    <div className="w-full h-full relative flex flex-col bg-slate-50 overflow-hidden font-sans text-slate-900">
      {(isPanelOpen || isValoresPanelOpen) && (
        <button
          onClick={() => {
            setIsPanelOpen(false);
            setIsValoresPanelOpen(false);
          }}
          className="fixed top-1 left-1/2 -translate-x-1/2 z-[4000] bg-slate-900 text-white px-10 py-2 rounded-full text-xs font-black uppercase tracking-[0.3em] shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:bg-indigo-600 transition-all active:scale-95 border border-white/20"
        >
          Fechar Painéis
        </button>
      )}

      {isAuditModalOpen && auditData && (
        <div className="fixed inset-0 z-[5000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1">
          <div className="bg-white w-full max-w-2xl rounded-[1rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-8 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">
                  Comparativo de Agrupamento
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase">
                  Rota: {auditData.routeName}
                </p>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="bg-slate-200 hover:bg-red-100 hover:text-red-600 p-1 rounded-full transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                  <span className="text-[10px] font-black uppercase text-indigo-400 block mb-1">
                    Pacotes Totais
                  </span>
                  <div className="text-3xl font-black">
                    {auditData.totalPackages}
                  </div>
                </div>
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                  <span className="text-[10px] font-black uppercase text-emerald-400 block mb-1">
                    Paradas Únicas
                  </span>
                  <div className="text-3xl font-black">
                    {auditData.plannedStops}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
                      Adicional Multi-pacotes (50%)
                    </p>
                    <div className="text-4xl font-black text-indigo-400">
                      R$ {auditData.plannedAddition.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">
                      Eficiência de Custo
                    </p>
                    <div className="text-xl font-black text-emerald-400">
                      {(auditData.efficiency * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[2000] w-[95%] max-w-6xl">
        <div className="bg-white/95 backdrop-blur-3xl p-3 rounded-[1rem] shadow-[0_20px_50px_-10px_rgba(0,0,0,0.15)] flex flex-wrap md:flex-nowrap items-center gap-3 border border-white/40">
          <div className="flex-1 flex items-center px-5 bg-slate-100 rounded-full h-16 border border-slate-200">
            <span className="text-[10px] font-black text-indigo-600 mr-4 uppercase tracking-widest shrink-0">
              Real
            </span>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="bg-transparent text-sm font-black text-slate-900 outline-none w-full cursor-pointer appearance-none uppercase"
            >
              <option value={ALL_VALUE}>Todos os Motoristas</option>
              {driverList.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsValoresPanelOpen(true)}
            className="bg-slate-800 hover:bg-indigo-600 text-white h-16 px-8 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg transition-all"
          >
            Análise Real
          </button>

          <div className="flex-1 flex items-center px-5 bg-slate-100 rounded-full h-16 border border-slate-200">
            <span className="text-[10px] font-black text-emerald-600 mr-4 uppercase tracking-widest shrink-0">
              Sugerido
            </span>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="bg-transparent text-sm font-black text-slate-900 outline-none w-full cursor-pointer appearance-none uppercase"
            >
              <option value={ALL_VALUE}>Todas as Rotas</option>
              {routeNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setIsPanelOpen(true)}
            className="bg-slate-900 hover:bg-indigo-600 text-white h-16 px-12 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-lg transition-all"
          >
            Análise Pro
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-1 p-2">
        <div
          id="map-left"
          className="flex-1 rounded-[2.5rem] overflow-hidden border-2 border-white shadow-sm"
        />
        <div
          id="map-right"
          className="flex-1 rounded-[2.5rem] overflow-hidden border-2 border-white shadow-sm"
        />
      </div>

      <div
        className={`fixed top-0 left-0 h-full w-full md:w-1/2 bg-white z-[3000] shadow-[20px_0_80px_rgba(0,0,0,0.1)] transition-all duration-500 ease-in-out p-3 md:p-3 overflow-y-auto ${
          isValoresPanelOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex justify-between items-start mb-2 border-b pb-2">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">
            Realizado motorista
          </h2>
        </div>
        {activeDriverData ? (
          <div className="space-y-6">
            <div className="bg-slate-900 p-4 md:p-5 rounded-[1rem] text-white shadow-xl border border-white/10">
              <p className="text-[11px] md:text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
                Faturamento Selecionado Real
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                  <span className="text-[11px] md:text-[10px] font-black uppercase text-white/70 leading-none">
                    Total
                  </span>
                  <div className="text-xl md:text-2xl font-black leading-none text-white">
                    {formatCurrency(activeDriverData.ValorTotal)}
                  </div>
                </div>
                {activeDriverStats && (
                  <>
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-emerald-200 leading-none">
                        Pacotes
                      </span>
                      <div className="text-xl md:text-2xl font-black leading-none">
                        {activeDriverStats.totalPackages}
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-sky-200 leading-none">
                        Paradas
                      </span>
                      <div className="text-xl md:text-2xl font-black leading-none">
                        {activeDriverStats.uniqueStops}
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-violet-200 leading-none">
                        Diária
                      </span>
                      <div className="text-lg md:text-xl font-black leading-none">
                        {formatCurrency(activeDriverData.ValorDiariaFixa)}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-sm md:text-xs font-bold text-white uppercase">
                  {activeDriverData.mot_nome}
                </p>
                <p className="text-[11px] md:text-[10px] font-bold text-slate-300 uppercase">
                  CAFs vinculados: {activeDriverData.CafID}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-[1.6rem] border border-slate-100 space-y-2">
              <p className="text-[12px] md:text-[11px] font-black text-slate-600 uppercase tracking-wide px-1">
                Categorias Consolidadas (Seleção)
              </p>
              {[
                {
                  label: "Pacotes < 300g",
                  val: activeDriverData.ValorMenor_300Gr,
                },
                {
                  label: "Pacotes > 300g",
                  val: activeDriverData.ValorMaior_300Gr,
                },
                {
                  label: "Entregas > 10k",
                  val: activeDriverData.ValorMaior_10k,
                },
                {
                  label: "Entregas > 20k",
                  val: activeDriverData.ValorMaior_20k,
                },
                {
                  label: "Valor Adicional",
                  val: activeDriverData.ValorAdicional,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white px-3 py-2 rounded-xl flex justify-between items-center shadow-sm border border-slate-100"
                >
                  <span className="text-base md:text-sm font-black text-slate-700 uppercase">
                    {item.label}
                  </span>
                  <span className="text-lg md:text-base font-mono font-black text-slate-900">
                    R$ {item.val?.toFixed(2) || "0.00"}
                  </span>
                </div>
              ))}
            </div>

            {selectedDriver === ALL_VALUE && (
              <div className="mt-12 space-y-4 pb-12">
                <div className="flex justify-between items-end px-2">
                  <h3 className="text-xl font-black uppercase tracking-tighter">
                    Ranking da Operação
                  </h3>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {allDriversSummary.length} Motoristas
                  </span>
                </div>

                <div className="overflow-hidden border border-slate-200 rounded-[1rem] shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead>
                        <tr className="bg-slate-900 text-white">
                          <th
                            className="p-2 text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-slate-800 transition-colors"
                            onClick={() => handleSort("nome")}
                          >
                            <div className="flex items-center">
                              Motorista{" "}
                              <SortIcon
                                active={sortKey === "nome"}
                                dir={sortDir}
                              />
                            </div>
                          </th>
                          <th
                            className="p-1 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer group hover:bg-slate-800 transition-colors"
                            onClick={() => handleSort("faturamento")}
                          >
                            <div className="flex items-center justify-end">
                              Faturamento{" "}
                              <SortIcon
                                active={sortKey === "faturamento"}
                                dir={sortDir}
                              />
                            </div>
                          </th>
                          <th
                            className="p-1 text-[10px] font-black uppercase tracking-widest text-center cursor-pointer group hover:bg-slate-800 transition-colors"
                            onClick={() => handleSort("pacotes")}
                          >
                            <div className="flex items-center justify-center">
                              Pacotes{" "}
                              <SortIcon
                                active={sortKey === "pacotes"}
                                dir={sortDir}
                              />
                            </div>
                          </th>
                          <th
                            className="p-1 text-[10px] font-black uppercase tracking-widest text-center cursor-pointer group hover:bg-slate-800 transition-colors"
                            onClick={() => handleSort("paradas")}
                          >
                            <div className="flex items-center justify-center">
                              Paradas{" "}
                              <SortIcon
                                active={sortKey === "paradas"}
                                dir={sortDir}
                              />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allDriversSummary.map((driver, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50 transition-colors group cursor-pointer ${
                              selectedDriver === driver.nome
                                ? "bg-indigo-50/50"
                                : ""
                            }`}
                            onClick={() => setSelectedDriver(driver.nome)}
                          >
                            <td className="p-1">
                              <div className="flex flex-col">
                                <span
                                  className={`text-xs font-black uppercase transition-colors ${
                                    selectedDriver === driver.nome
                                      ? "text-indigo-600"
                                      : "text-slate-700 group-hover:text-indigo-600"
                                  }`}
                                >
                                  {driver.nome}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">
                                  Seleção Rápida
                                </span>
                              </div>
                            </td>
                            <td className="p-1 text-right">
                              <span
                                className={`text-xs font-mono font-black ${
                                  sortKey === "faturamento"
                                    ? "text-indigo-600"
                                    : "text-slate-600"
                                }`}
                              >
                                R$ {driver.faturamento.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-1 text-center">
                              <span
                                className={`inline-flex items-center justify-center text-[10px] font-black px-2 py-1 rounded-lg border transition-colors ${
                                  sortKey === "pacotes"
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                }`}
                              >
                                {driver.pacotes}
                              </span>
                            </td>
                            <td className="p-1 text-center">
                              <span
                                className={`inline-flex items-center justify-center text-[10px] font-black px-2 py-1 rounded-lg border transition-colors ${
                                  sortKey === "paradas"
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-blue-50 text-blue-700 border-blue-100"
                                }`}
                              >
                                {driver.paradas}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-slate-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-slate-400 font-bold uppercase italic text-sm px-10 leading-relaxed">
              Carregando dados da operação...
            </p>
          </div>
        )}
      </div>

      <div
        ref={proPanelRef}
        className={`fixed top-0 right-0 h-full w-full md:w-1/2 bg-white z-[3000] shadow-[-20px_0_80px_rgba(0,0,0,0.1)] transition-all duration-500 ease-in-out p-3 md:p-3 overflow-y-auto ${
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-start mb-2 border-b pb-3 text-right">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none w-full">
            <span className="text-indigo-600">
              Rotas Planejador de roteiros
            </span>
          </h2>
        </div>

        <div className="space-y-6">
          {proSelection ? (
            <>
              <div className="space-y-4 pb-4">
                <div
                  className={`${
                    selectedRoute !== ALL_VALUE
                      ? "bg-slate-900"
                      : "bg-indigo-600"
                  } p-4 md:p-6 rounded-[1rem] text-white shadow-xl border border-white/10 relative overflow-hidden group transition-all ${
                    isRouteHighlightActive && selectedRoute !== ALL_VALUE
                      ? "ring-4 ring-emerald-400/60 animate-pulse"
                      : ""
                  }`}
                >
                  <p
                    className={`text-[11px] md:text-xs font-black uppercase tracking-[0.3em] mb-3 ${
                      selectedRoute !== ALL_VALUE
                        ? "text-indigo-400"
                        : "text-white/60"
                    }`}
                  >
                    {proSelection.label}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-white/70 leading-none">
                        Total
                      </span>
                      <div className="text-xl md:text-2xl font-black leading-none text-white">
                        {formatCurrency(
                          selectedRoute !== ALL_VALUE
                            ? proSelection.pricing.finalPrice
                            : operationPricingTotal?.valorTotal || 0
                        )}
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-emerald-100 leading-none">
                        Pacotes
                      </span>
                      <div className="text-xl md:text-2xl font-black leading-none">
                        {proSelection.pacotes}
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg px-2 py-1 inline-flex flex-col items-center text-center">
                      <span className="text-[11px] md:text-[10px] font-black uppercase text-sky-100 leading-none">
                        Paradas
                      </span>
                      <div className="text-xl md:text-2xl font-black leading-none">
                        {proSelection.paradas}
                      </div>
                    </div>
                  </div>
                  <div className="text-[12px] md:text-[13px] mt-2 font-bold text-slate-200 uppercase flex flex-wrap gap-3">
                    <span>{formatCurrency(proSelection.pricing.base)}</span>
                    <span>
                      {formatCurrency(
                        proSelection.pesoKg * pricingParams.pricePerKg
                      )}
                    </span>
                    <span>
                      {formatCurrency(
                        proSelection.volumeM3 * pricingParams.pricePerM3
                      )}
                    </span>
                  </div>
                  {selectedRoute === ALL_VALUE && (
                    <div className="text-[10px] mt-2 font-bold text-white/40 uppercase">
                      Base: {routeNames.length} rotas otimizadas
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <div>
                  <p className="text-[14px] font-black uppercase">
                    Variáveis da Equação (Multiplicadores)
                  </p>
                  <p className="text-[12px] font-bold  mt-1">
                    Custo/km (C_km), tipo do veículo (V) e taxa fixa (F) seguem o
                    veículo selecionado para a rota.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <span className="text-[12px] font-black uppercase text-slate-400">
                      C_km
                    </span>
                    <div className="text-[14px] font-mono font-black text-slate-700">
                      R${" "}
                      {proSelection.distKm > 0
                        ? (
                            proSelection.pricing.base / proSelection.distKm
                          ).toFixed(2)
                        : "0.00"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <span className="text-[12px] font-black uppercase text-slate-400">
                      V
                    </span>
                    <div className="text-[14px] font-mono font-black text-slate-700">
                      x{proSelection.pricing.multipliers.V.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <span className="text-[12px] font-black uppercase text-slate-400">
                      Taxa fixa (F)
                    </span>
                    <div className="text-[14px] font-mono font-black text-slate-700">
                      R$ {proSelection.pricing.fixedFee.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Preço por KG (R$)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={pricingParams.pricePerKg}
                      onChange={(event) =>
                        updatePricingParam(
                          "pricePerKg",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Preço por M3 (R$)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={pricingParams.pricePerM3}
                      onChange={(event) =>
                        updatePricingParam(
                          "pricePerM3",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Trânsito - T
                    </span>
                    <select
                      value={pricingParams.traffic}
                      onChange={(event) =>
                        updatePricingParam(
                          "traffic",
                          event.target.value as PricingParams["traffic"]
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 uppercase"
                    >
                      <option value="LIVRE">Livre</option>
                      <option value="MODERADO">Moderado</option>
                      <option value="INTENSO">Intenso</option>
                      <option value="MUITO_INTENSO">Muito intenso</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Clima - C
                    </span>
                    <select
                      value={pricingParams.climate}
                      onChange={(event) =>
                        updatePricingParam(
                          "climate",
                          event.target.value as PricingParams["climate"]
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 uppercase"
                    >
                      <option value="CEU_LIMPO">Céu limpo</option>
                      <option value="CHUVA_FRACA">Chuva fraca</option>
                      <option value="CHUVA_FORTE">Chuva forte</option>
                      <option value="TEMPESTADE">Tempestade</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      SLA
                    </span>
                    <select
                      value={pricingParams.sla}
                      onChange={(event) =>
                        updatePricingParam(
                          "sla",
                          event.target.value as PricingParams["sla"]
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 uppercase"
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="SAME_DAY">Same day</option>
                      <option value="EXPRESS">Express</option>
                      <option value="IMEDIATA">Imediata</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Risco - R
                    </span>
                    <select
                      value={pricingParams.risk}
                      onChange={(event) =>
                        updatePricingParam(
                          "risk",
                          event.target.value as PricingParams["risk"]
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 uppercase"
                    >
                      <option value="BAIXO">Baixo</option>
                      <option value="MEDIO">Médio</option>
                      <option value="ALTO">Alto</option>
                      <option value="MUITO_ALTO">Muito alto</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Pedidos - S
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pricingParams.pedidos}
                      onChange={(event) =>
                        updatePricingParam(
                          "pedidos",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Motoristas - S
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pricingParams.motoristas}
                      onChange={(event) =>
                        updatePricingParam(
                          "motoristas",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">
                      Pacote 300g (R$)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={pricingParams.packagePrice300g}
                      onChange={(event) =>
                        updatePricingParam(
                          "packagePrice300g",
                          Number(event.target.value)
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </label>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-2">
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-4 px-2">
                  Memória de Cálculo (Pro)
                </p>
                {proSelection.pricing.breakdownSteps.map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border-b border-slate-50 last:border-0"
                  >
                    <div className="flex flex-col">
                      <span
                        className={`text-[11px] font-black ${
                          s.step.includes("Adicional")
                            ? "text-indigo-600"
                            : "text-slate-700"
                        }`}
                      >
                        {s.step}
                      </span>
                      {s.note && (
                        <span className="text-[9px] font-bold text-slate-400">
                          {s.note}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-mono font-black ${
                        s.value > 0 ? "text-indigo-600" : "text-slate-400"
                      }`}
                    >
                      {s.step.includes("Fator") ||
                      s.step.includes("Multiplicadores")
                        ? `x${s.value.toFixed(2)}`
                        : `R$ ${s.value.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-indigo-600 p-4 rounded-[1rem] text-white shadow-xl">
                <p className="text-xs font-black uppercase text-white/60 tracking-widest mb-4">
                  Total Projetado (Operação)
                </p>
                <div className="text-5xl font-black tracking-tighter">
                  R$ {operationPricingTotal?.valorTotal.toFixed(2)}
                </div>
                <div className="text-[10px] mt-4 font-bold text-white/40 uppercase">
                  Base: {routeNames.length} rotas otimizadas
                </div>
              </div>
            </div>
          )}
          {/* TABELA DE RESUMO PRO - SÓ APARECE EM VISUALIZAÇÃO GERAL */}
          {true && (
            <div className="mt-12 space-y-4 pb-20">
              <div className="flex justify-between items-end px-2">
                <h3 className="text-xl font-black uppercase tracking-tighter">
                  Resumo por Rota Sugerida
                </h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {routeNames.length} Trechos
                </span>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-[1rem] shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th
                          className="p-2 text-[10px] font-black uppercase tracking-widest text-center"
                        >
                          <div className="flex items-center justify-center">
                            Veículo
                          </div>
                        </th>
                        <th
                          className="p-1 text-[10px] font-black uppercase tracking-widest cursor-pointer group hover:bg-slate-800 transition-colors"
                          onClick={() => handleSortPro("nome")}
                        >
                          <div className="flex items-center">
                            Rota{" "}
                            <SortIcon
                              active={proSortKey === "nome"}
                              dir={proSortDir}
                            />
                          </div>
                        </th>
                        <th
                          className="p-2 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer group hover:bg-slate-800 transition-colors"
                          onClick={() => handleSortPro("distancia")}
                        >
                          <div className="flex items-center justify-end">
                            Distância{" "}
                            <SortIcon
                              active={proSortKey === "distancia"}
                              dir={proSortDir}
                            />
                          </div>
                        </th>
                        <th className="p-2 text-[10px] font-black uppercase tracking-widest text-right">
                          <div className="flex items-center justify-end">
                            Peso (KG)
                          </div>
                        </th>
                        <th className="p-2 text-[10px] font-black uppercase tracking-widest text-right">
                          <div className="flex items-center justify-end">
                            Volume (M3)
                          </div>
                        </th>
                        <th className="p-2 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer group hover:bg-slate-800 transition-colors">
                          <div className="flex items-center justify-end">
                            Multi-Pacotes (R$)
                          </div>
                        </th>
                        <th
                          className="p-2 text-[10px] font-black uppercase tracking-widest text-right cursor-pointer group hover:bg-slate-800 transition-colors"
                          onClick={() => handleSortPro("faturamento")}
                        >
                          <div className="flex items-center justify-end">
                            Preço Total{" "}
                            <SortIcon
                              active={proSortKey === "faturamento"}
                              dir={proSortDir}
                            />
                          </div>
                        </th>
                        <th
                          className="p-1 text-[10px] font-black uppercase tracking-widest text-center cursor-pointer group hover:bg-slate-800 transition-colors"
                          onClick={() => handleSortPro("pacotes")}
                        >
                          <div className="flex items-center justify-center">
                            Pacotes{" "}
                            <SortIcon
                              active={proSortKey === "pacotes"}
                              dir={proSortDir}
                            />
                          </div>
                        </th>
                        <th
                          className="p-1 text-[10px] font-black uppercase tracking-widest text-center cursor-pointer group hover:bg-slate-800 transition-colors"
                          onClick={() => handleSortPro("paradas")}
                        >
                          <div className="flex items-center justify-center">
                            Paradas{" "}
                            <SortIcon
                              active={proSortKey === "paradas"}
                              dir={proSortDir}
                            />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allRoutesSummaryPro.map((route, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 transition-colors group cursor-pointer ${
                            selectedRoute === route.nome
                              ? "bg-emerald-50/50"
                              : ""
                          }`}
                          onClick={() => setSelectedRoute(route.nome)}
                        >
                          <td className="p-1 text-center">
                            <select
                              value={route.vehicle}
                              onChange={(event) => {
                                const nextVehicle = event.target
                                  .value as VehicleType;
                                setRouteVehicles((prev) => ({
                                  ...prev,
                                  [route.nome]: nextVehicle,
                                }));
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className="bg-white text-[10px] font-black text-slate-700 uppercase border border-slate-200 rounded-lg px-2 py-1 hover:border-emerald-400 focus:border-emerald-500 outline-none"
                            >
                              <option value="moto">Moto</option>
                              <option value="carro">Carro</option>
                              <option value="van">Van</option>
                              <option value="caminhao">Caminhão</option>
                            </select>
                          </td>
                          <td className="p-1">
                            <span
                              className={`text-xs font-black uppercase transition-colors ${
                                selectedRoute === route.nome
                                  ? "text-emerald-600"
                                  : "text-slate-700 group-hover:text-emerald-600"
                              }`}
                            >
                              {route.nome}
                            </span>
                          </td>
                          <td className="p-1 text-center">
                            <span
                              className={`inline-flex items-center justify-center text-[10px] font-black px-2 py-1 rounded-lg border transition-colors relative ${
                                proSortKey === "paradas"
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-100"
                              }`}
                            >
                              <span className="peer cursor-help">
                                {formatCurrency(route.faturamento.base)}
                              </span>
                              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 rounded-xl bg-slate-950 px-3 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-opacity peer-hover:opacity-100">
                                {route.distancia.toFixed(2)} km
                              </span>
                            </span>
                          </td>
                          <td className="p-1 text-right">
                            <span className="text-xs font-mono font-black text-slate-600 relative inline-flex">
                              <span className="peer cursor-help">
                                {formatCurrency(
                                  route.pesoKg * pricingParams.pricePerKg
                                )}
                              </span>
                              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 rounded-xl bg-slate-950 px-3 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-opacity peer-hover:opacity-100">
                                {route.pesoKg.toFixed(2)} kg
                              </span>
                            </span>
                          </td>
                          <td className="p-1 text-right">
                            <span className="text-xs font-mono font-black text-slate-600 relative inline-flex">
                              <span className="peer cursor-help">
                                {formatCurrency(
                                  route.volumeM3 * pricingParams.pricePerM3
                                )}
                              </span>
                              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 rounded-xl bg-slate-950 px-3 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-opacity peer-hover:opacity-100">
                                {route.volumeM3.toFixed(3)} m³
                              </span>
                            </span>
                          </td>
                          <td className="p-1 text-right">
                            <span
                              className={`text-xs font-mono font-black ${
                                proSortKey === "faturamento"
                                  ? "text-indigo-600"
                                  : "text-slate-600"
                              }`}
                            >
                              {formatCurrency(
                                (route.pacotes - route.paradas) *
                                  (pricingParams.packagePrice300g / 2)
                              )}
                            </span>
                          </td>
                          <td className="p-1 text-right">
                            <span
                              className={`text-xs font-mono font-black ${
                                proSortKey === "faturamento"
                                  ? "text-indigo-600"
                                  : "text-slate-600"
                              }`}
                            >
                              {formatCurrency(route.faturamento.finalPrice)}
                            </span>
                          </td>
                          <td className="p-1 text-center">
                            <span
                              className={`inline-flex items-center justify-center text-[10px] font-black px-2 py-1 rounded-lg border transition-colors ${
                                proSortKey === "pacotes"
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {route.pacotes}
                            </span>
                          </td>
                          <td className="p-1 text-center">
                            <span
                              className={`inline-flex items-center justify-center text-[10px] font-black px-2 py-1 rounded-lg border transition-colors ${
                                proSortKey === "paradas"
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-100"
                              }`}
                            >
                              {route.paradas}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
