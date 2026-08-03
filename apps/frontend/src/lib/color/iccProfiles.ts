import type { IccProfileInfo } from "@/lib/types";

export const ICC_PROFILES: IccProfileInfo[] = [
  {
    id: "fogra39",
    label: "FOGRA39 / ISO Coated v2",
    description:
      "ISO 12647-2:2004, papel revestido tipo 1 e 2, cobertura de tinta 300%. Perfil clássico para offset.",
    file: "/icc/ISOcoated_v2_300_eci.icc",
  },
  {
    id: "fogra51",
    label: "FOGRA51 / PSO Coated v3",
    description:
      "ISO 12647-2:2013, papel revestido premium, cobertura de tinta 300%. Sucessor do ISO Coated v2.",
    file: "/icc/PSOcoated_v3.icc",
  },
  {
    id: "gracol2013",
    label: "GRACoL 2013",
    description:
      "CGATS21-2 / CRPC6, processo comercial offset definido pela IDEAlliance, comum em gráficas americanas.",
    file: "/icc/GRACoL2013_CRPC6.icc",
  },
  {
    id: "custom",
    label: "Perfil personalizado",
    description: "Envie seu próprio arquivo ICC ou ICM fornecido pela sua gráfica.",
    file: null,
  },
];

export function getIccProfile(id: string): IccProfileInfo {
  return ICC_PROFILES.find((p) => p.id === id) ?? ICC_PROFILES[0];
}
