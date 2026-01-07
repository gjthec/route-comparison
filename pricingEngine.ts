import { PricingParams, PricingResult } from "./types";

const TABLES = {
  C_KM: { moto: 1.2, carro: 2.5, van: 4.2, caminhao: 7.5 },
  V_FACTOR: { moto: 1.0, carro: 1.15, van: 1.35, caminhao: 1.8 },
  TRAFFIC: { LIVRE: 1.0, MODERADO: 1.15, INTENSO: 1.35, MUITO_INTENSO: 1.6 },
  CLIMATE: {
    CEU_LIMPO: 1.0,
    CHUVA_FRACA: 1.1,
    CHUVA_FORTE: 1.25,
    TEMPESTADE: 1.45,
  },
  SLA: { NORMAL: 1.0, SAME_DAY: 1.1, EXPRESS: 1.25, IMEDIATA: 1.45 },
  RISK: { BAIXO: 1.0, MEDIO: 1.1, ALTO: 1.2, MUITO_ALTO: 1.3 },
  FIXED_FEE: { moto: 5.0, carro: 8.0, van: 15.0, caminhao: 25.0 },
};

export const calculatePriceEnterprise = (
  distKm: number,
  p: PricingParams,
  totalPackages: number = 1,
  uniqueStops: number = 1,
  totalWeightKg: number = 0
): PricingResult => {
  // 1. Cálculo Base (D x C_km)
  const c_km = TABLES.C_KM[p.vehicle];
  const baseDistance = distKm * c_km;
  const baseWeight = totalWeightKg * p.pricePerKg;

  // 2. Multiplicadores
  const V = TABLES.V_FACTOR[p.vehicle];
  const T = TABLES.TRAFFIC[p.traffic];
  const C = TABLES.CLIMATE[p.climate];
  const SLA = TABLES.SLA[p.sla];
  const R = TABLES.RISK[p.risk];

  let S = 1.0;
  if (p.motoristas <= 0) {
    S = 2.5;
  } else {
    S = 1 + Math.max(0, (p.pedidos - p.motoristas) / p.motoristas);
  }
  S = Math.min(Math.max(S, 1.0), 2.5);

  const multipliersProduct = V * T * C * S * SLA * R;
  const F = TABLES.FIXED_FEE[p.vehicle];

  // 3. Regra de Multi-pacotes (50% do valor base de 300g por pacote extra)
  // Se houver mais de 1 pacote no total comparado às paradas únicas
  const extraPackagesCount = Math.max(0, totalPackages - uniqueStops);
  const multiPackageAddition = extraPackagesCount * (p.packagePrice300g * 0.5);

  // Preço Final = ((D x C_km) x Multiplicadores) + Taxa Fixa + Adicional Multi-pacotes
  const finalPriceRaw =
    (baseDistance + baseWeight) * multipliersProduct + F + multiPackageAddition;
  const finalPrice = Math.round((finalPriceRaw + Number.EPSILON) * 100) / 100;

  return {
    finalPrice,
    base: Math.round(baseDistance * 100) / 100,
    fixedFee: F,
    multiPackageAddition,
    multipliers: { V, T, C, S, SLA, R },
    multipliersProduct: Math.round(multipliersProduct * 10000) / 10000,
    breakdownSteps: [
      {
        step: "Base (Distância)",
        value: baseDistance,
        note: `${distKm.toFixed(2)}km x R$ ${c_km.toFixed(2)}`,
      },
      {
        step: "Base (Peso)",
        value: baseWeight,
        note: `${totalWeightKg.toFixed(2)}kg x R$ ${p.pricePerKg.toFixed(2)}`,
      },
      {
        step: "Multiplicadores Logísticos",
        value: multipliersProduct,
        note: "V x T x C x S x SLA x R",
      },
      { step: "Taxa Fixa (F)", value: F },
      {
        step: "Adicional Multi-pacotes",
        value: multiPackageAddition,
        note: `${extraPackagesCount} pacotes extras (50% de R$ ${p.packagePrice300g.toFixed(
          2
        )})`,
      },
    ],
  };
};
