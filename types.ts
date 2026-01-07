export interface RoutePoint {
  routeName: string;
  awb: string;
  order: number;
  parada: number;
  lat: number;
  long: number;
  cafid: string;
  nome: string;
  peso_kg: number;
  volume_cm3: number;
  valor: number;
  distancia_primeiro_ponto_km: number;
  distancia_dentro_rota_km: number;
  tempo_primeiro_ponto: string;
  tempo_dentro_rota: string;
  // Campos injetados pelo Engine
  price_final?: number;
  pricing?: PricingResult;
}

export interface DriverCost {
  mot_nome: string;
  CafID: string;
  ValorDiariaFixa: number;
  ValorTotal: number;
  ValorAdicional: number;
  // Campos adicionais usados no parsing em utils.ts
  ValorMenor_300Gr?: number;
  ValorMaior_300Gr?: number;
  ValorMenor_1k?: number;
  ValorMaior_1k?: number;
  ValorMaior_10k?: number;
  ValorMaior_20k?: number;
  ValorQtde?: number;
  ValorLptAgre?: number;
  ValorLevissimo?: number;
  ValorExpresso?: number;
  ValorGobback?: number;
  ValorRma?: number;
  ValorCardsAgre?: number;
  ValorReversaAgre?: number;
  ValorAdicionalCombustivel?: number;
  ValorTotalEntregasNaoAgrupadas?: number;
  ValorEntregaAgrupadaMenor_300Gr?: number;
  ValorEntregaAgrupadaMaior_300Gr?: number;
  ValorEntregaAgrupadaMenor_1k?: number;
  ValorEntregaAgrupadaMaior_1k?: number;
  ValorEntregaAgrupadaMaior_10k?: number;
  ValorEntregaAgrupadaMaior_20k?: number;
  ValorEntregaAgrupadaTotal?: number;
}

export type VehicleType = "moto" | "carro" | "van" | "caminhao";
export type TrafficType = "LIVRE" | "MODERADO" | "INTENSO" | "MUITO_INTENSO";
export type ClimateType =
  | "CEU_LIMPO"
  | "CHUVA_FRACA"
  | "CHUVA_FORTE"
  | "TEMPESTADE";
export type SLAType = "NORMAL" | "SAME_DAY" | "EXPRESS" | "IMEDIATA";
export type RiskType = "BAIXO" | "MEDIO" | "ALTO" | "MUITO_ALTO";
export interface PricingParams {
  vehicle: VehicleType;
  traffic: TrafficType;
  climate: ClimateType;
  sla: SLAType;
  risk: RiskType;
  pedidos: number;
  motoristas: number;
  pricePerKg: number;
  packagePrice300g: number; // Novo campo para regra de 50%
}

export interface PricingResult {
  finalPrice: number;
  base: number;
  fixedFee: number;
  multiPackageAddition: number; // Valor somado por pacotes extras
  multipliers: {
    V: number;
    T: number;
    C: number;
    S: number;
    SLA: number;
    R: number;
  };
  multipliersProduct: number;
  breakdownSteps: Array<{
    step: string;
    value: number;
    note?: string;
  }>;
}
