import type {
  MarketplacePage,
  MarketplaceTestCell,
} from "../../marketplace";

export type OperationsPage<T> = MarketplacePage<T>;
export type TestCell = MarketplaceTestCell;

export interface Site {
  oid: number;
  name: string | null;
}

export interface UniversalVariable {
  name: string;
  description: string | null;
  unit: string;
  status: string;
  source: string | null;
}

export interface UniversalVariableUnit {
  name: string;
  unitGroup: string | null;
  source: string | null;
}

export interface UniversalVariableUnitGroup {
  name: string;
  source: string | null;
}

export interface UniversalVariableCatalog {
  universalVariables: UniversalVariable[];
  units: UniversalVariableUnit[];
  unitGroups: UniversalVariableUnitGroup[];
}

export interface OperationsQuery {
  cursor?: number;
  limit?: number;
  search?: string;
  sort?: { field: string; descending: boolean };
}

export interface UniversalVariableCreate {
  name: string;
  description: string;
  unit: string;
}
