/**
 * audit-logger.js
 * Comprehensive purchase and action audit logging for The Eternal Simulation.
 * Captures detailed transactional setup snapshots, exportable to JSON and CSV.
 */

import { serializeBig, formatEnergy, formatRate } from "./numeric.js";
import {
  calculateAvailableData,
  calculateEnergyProduction,
  calculateComputerPerformanceMultiplier,
  calculateFacilityDeviceMultiplier,
  calculateProcessorDeviceMultiplier,
} from "./formulas.js";

export function recordPurchaseAudit(state, config, {
  actionType = "PURCHASE",
  itemKey,
  itemName,
  requestedQuantity = 1,
  purchasedQuantity = 1,
  nominalCost = null,
  currencyDebited = null,
  isForced = false,
  isBypassed = false,
  energyBefore,
  energyAfter,
  metadata = {},
} = {}) {
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];
  const simTime = Math.round((state.stats?.gameTime ?? 0) * 100) / 100;

  const dataBefore = calculateAvailableData({ ...state, energy: energyBefore }, config);
  const dataAfter = calculateAvailableData(state, config);
  const prodBefore = calculateEnergyProduction({ ...state, energy: energyBefore }, config);
  const prodAfter = calculateEnergyProduction(state, config);

  const entry = {
    id: (state.auditLogs.length > 0 ? state.auditLogs[state.auditLogs.length - 1].id + 1 : 1),
    timestamp: timeStr,
    simulationTimestamp: simTime,
    actionType,
    itemKey,
    itemName: itemName || itemKey,
    requestedQuantity,
    purchasedQuantity,
    nominalCost: nominalCost !== null && nominalCost !== undefined ? serializeBig(nominalCost) : "TBD",
    nominalCostFormatted: nominalCost !== null && nominalCost !== undefined ? formatEnergy(nominalCost) : "TBD",
    currencyDebited: currencyDebited !== null && currencyDebited !== undefined ? serializeBig(currencyDebited) : "0",
    currencyDebitedFormatted: currencyDebited !== null && currencyDebited !== undefined ? formatEnergy(currencyDebited) : "0.00 pJ",
    isForced,
    isBypassed,
    ruleStatus: isForced || isBypassed ? "DEV_BYPASS" : "RULE_ELIGIBLE",
    computerLevel: state.computerLevel ?? 1,
    facilityOptimizations: state.facilityOptimizations ?? 0,
    energyBefore: serializeBig(energyBefore),
    energyBeforeFormatted: formatEnergy(energyBefore),
    energyAfter: serializeBig(energyAfter),
    energyAfterFormatted: formatEnergy(energyAfter),
    availableDataBefore: dataBefore,
    availableDataAfter: dataAfter,
    productionBeforeFormatted: formatRate(prodBefore),
    productionAfterFormatted: formatRate(prodAfter),
    setupSnapshot: {
      computerLevel: state.computerLevel ?? 1,
      facilityOptimizations: state.facilityOptimizations ?? 0,
      computerMultiplier: calculateComputerPerformanceMultiplier(state.computerLevel ?? 1, config),
      facilityMultiplier: calculateFacilityDeviceMultiplier(state.facilityOptimizations ?? 0, config),
      processorMultiplier: calculateProcessorDeviceMultiplier(state.devices?.processors ?? 0, config),
      algorithms: {
        AImp: state.algorithms?.AImp?.owned ?? 0,
        AUpg: state.algorithms?.AUpg?.owned ?? 0,
        ARec: state.algorithms?.ARec?.owned ?? 0,
      },
      devices: {
        chips: state.devices?.chips?.owned ?? 0,
        transistorBoard: Boolean(state.devices?.transistorBoard?.owned),
        transistorsPurchased: state.devices?.transistorsPurchased ?? 0,
        transistorAllocations: { ...(state.devices?.transistorAllocations ?? {}) },
        microprocessor: state.devices?.microprocessor?.owned ?? 0,
        microTarget: state.devices?.microprocessor?.target ?? "AImp",
        overclocker: state.devices?.overclocker?.owned ?? 0,
        overclockActive: Boolean(state.devices?.overclocker?.active),
        crcGadget: state.devices?.crcGadget?.owned ?? 0,
        capacitors: state.devices?.capacitors ?? 0,
        processors: state.devices?.processors ?? 0,
        hardDisks: state.devices?.hardDisks?.owned ?? 0,
        hardDiskState: state.devices?.hardDisks?.state ?? "off",
        hardDiskBuffer: state.devices?.hardDisks?.buffer ?? 0,
        powerCells: state.powerCells ?? 0,
      },
    },
    metadata,
  };

  if (!state.auditLogs) state.auditLogs = [];
  state.auditLogs.push(entry);

  const maxLogs = 1000;
  if (state.auditLogs.length > maxLogs) {
    state.auditLogs.splice(0, state.auditLogs.length - maxLogs);
  }

  return entry;
}

export function exportAuditLogsAsJSON(state) {
  return JSON.stringify(state.auditLogs ?? [], null, 2);
}

export function exportAuditLogsAsCSV(state) {
  const logs = state.auditLogs ?? [];
  if (logs.length === 0) return "";

  const headers = [
    "ID",
    "Timestamp",
    "Sim_Time_s",
    "Action",
    "Item",
    "Req_Qty",
    "Purchased_Qty",
    "Nominal_Cost",
    "Debited",
    "Rule_Status",
    "Computer_Level",
    "Facility_Optimizations",
    "Energy_Before",
    "Energy_After",
    "Data_After",
    "AImp_Owned",
    "AUpg_Owned",
    "ARec_Owned",
    "Chips",
    "Transistors",
    "Microprocessors",
    "Overclocker_Active",
    "Capacitors",
    "Processors",
    "Hard_Disks",
    "Power_Cells",
  ];

  const rows = logs.map((log) => [
    log.id,
    `"${log.timestamp}"`,
    log.simulationTimestamp,
    `"${log.actionType}"`,
    `"${log.itemName}"`,
    log.requestedQuantity,
    log.purchasedQuantity,
    `"${log.nominalCostFormatted}"`,
    `"${log.currencyDebitedFormatted}"`,
    log.ruleStatus,
    log.computerLevel,
    log.facilityOptimizations,
    `"${log.energyBeforeFormatted}"`,
    `"${log.energyAfterFormatted}"`,
    log.availableDataAfter,
    log.setupSnapshot?.algorithms?.AImp ?? 0,
    log.setupSnapshot?.algorithms?.AUpg ?? 0,
    log.setupSnapshot?.algorithms?.ARec ?? 0,
    log.setupSnapshot?.devices?.chips ?? 0,
    log.setupSnapshot?.devices?.transistorsPurchased ?? 0,
    log.setupSnapshot?.devices?.microprocessor ?? 0,
    log.setupSnapshot?.devices?.overclockActive ? "TRUE" : "FALSE",
    log.setupSnapshot?.devices?.capacitors ?? 0,
    log.setupSnapshot?.devices?.processors ?? 0,
    log.setupSnapshot?.devices?.hardDisks ?? 0,
    log.setupSnapshot?.devices?.powerCells ?? 0,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
