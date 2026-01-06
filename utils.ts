import { RoutePoint, PricingParams, PricingResult, DriverCost } from "./types";

export const clamp = (x: number, min: number, max: number) =>
  Math.min(Math.max(x, min), max);

export const parseCSV = (
  csv: string
): { data: RoutePoint[]; error?: string } => {
  const rawLines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rawLines.length < 2)
    return { data: [], error: "Arquivo de rotas vazio." };

  const headerLine = rawLines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  const colMap = {
    routeName: headers.indexOf("routename"),
    awb: headers.indexOf("awb"),
    order: headers.indexOf("order"),
    parada: headers.indexOf("parada"),
    lat: headers.indexOf("lat"),
    long: headers.findIndex((h) => h === "long" || h === "lon"),
    cafid: headers.indexOf("cafid"),
    nome: headers.indexOf("nome"),
    peso_kg: headers.indexOf("peso_kg"),
    volume_cm3: headers.indexOf("volume_cm3"),
    valor: headers.indexOf("valor"),
    distancia_primeiro_ponto_km: headers.indexOf("distancia_primeiro_ponto_km"),
    distancia_dentro_rota_km: headers.indexOf("distancia_dentro_rota_km"),
    tempo_primeiro_ponto: headers.indexOf("tempo_primeiro_ponto"),
    tempo_dentro_rota: headers.indexOf("tempo_dentro_rota"),
  };

  const data: RoutePoint[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cols = rawLines[i].split(delimiter);
    if (cols.length < 5) continue;
    data.push({
      routeName: cols[colMap.routeName]?.trim() || "S/N",
      awb: cols[colMap.awb]?.trim() || "",
      order: parseInt(cols[colMap.order], 10) || 0,
      parada: parseInt(cols[colMap.parada], 10) || 0,
      lat: parseFloat(cols[colMap.lat]?.replace(",", ".")),
      long: parseFloat(cols[colMap.long]?.replace(",", ".")),
      cafid: colMap.cafid !== -1 ? cols[colMap.cafid]?.trim() : "",
      nome: colMap.nome !== -1 ? cols[colMap.nome]?.trim() : "",
      peso_kg: parseFloat(cols[colMap.peso_kg]),
      volume_cm3: parseFloat(cols[colMap.volume_cm3]),
      valor: parseFloat(cols[colMap.valor]),
      distancia_primeiro_ponto_km: parseFloat(
        cols[colMap.distancia_primeiro_ponto_km]
      ),
      distancia_dentro_rota_km: parseFloat(
        cols[colMap.distancia_dentro_rota_km]
      ),
      tempo_primeiro_ponto: cols[colMap.tempo_primeiro_ponto],
      tempo_dentro_rota: cols[colMap.tempo_dentro_rota],
    });
  }

  return { data: data.sort((a, b) => a.order - b.order) };
};

export const parseValoresCSV = (csv: string): DriverCost[] => {
  const rawLines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rawLines.length < 2) return [];

  const headerLine = rawLines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase());

  const getCol = (h: string) => headers.indexOf(h.toLowerCase());

  const data: DriverCost[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cols = rawLines[i].split(delimiter).map((c) => c.trim());
    if (cols.length < 2) continue;

    const parseVal = (idx: number) => {
      if (idx === -1 || !cols[idx]) return 0;
      // Remove aspas e espaços
      let s = cols[idx].replace(/"/g, "").trim();
      // Se o ponto é decimal, removemos apenas a vírgula (que seria o milhar em padrão US)
      // Se for padrão BR puro (1.000,00), a lógica precisaria inverter,
      // mas como o usuário confirmou que o ponto é o decimal:
      s = s.replace(/,/g, "");
      return parseFloat(s) || 0;
    };

    data.push({
      mot_nome: cols[getCol("mot_nome")] || "",
      CafID: cols[getCol("cafid")] || "",
      ValorDiariaFixa: parseVal(getCol("valordiariafixa")),
      ValorMenor_300Gr: parseVal(getCol("valormenor_300gr")),
      ValorMaior_300Gr: parseVal(getCol("valormaior_300gr")),
      ValorMaior_10k: parseVal(getCol("valormaior_10k")),
      ValorMaior_20k: parseVal(getCol("valormaior_20k")),
      ValorTotal: parseVal(getCol("valortotal")),
    } as any);
  }
  return data;
};

export const haversine = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const smoothRoute = (points: RoutePoint[]): RoutePoint[] => {
  if (points.length < 3) return [...points];
  return points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return { ...p };
    const prev = points[i - 1];
    const next = points[i + 1];
    return {
      ...p,
      lat: (prev.lat + p.lat + next.lat) / 3,
      long: (prev.long + p.long + next.long) / 3,
    };
  });
};

export const getRouteColor = (id: string, allSortedIds: string[]): string => {
  const index = allSortedIds.indexOf(id);
  const hue = (index * 137.508) % 360;
  return `hsl(${hue}, 75%, 50%)`;
};

export const naturalRouteSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
