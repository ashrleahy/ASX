// Representative basket of liquid ASX-listed large/mid-cap stocks.
//
// NOTE: this is NOT the official point-in-time ASX200 constituent list -
// it's today's well-known liquid names, used to prototype the strategy logic
// for free. That means there's a mild survivorship bias (we never see
// stocks that get delisted or fall out of the index over time). Closing
// that gap properly is exactly what a paid bias-free dataset (e.g. Norgate)
// is for - worth doing before trusting absolute backtest returns, less
// important for just generating live signals off current constituents.

export const TICKERS: string[] = [
  // Banks / Financials
  "CBA.AX", "WBC.AX", "ANZ.AX", "NAB.AX", "MQG.AX", "QBE.AX", "SUN.AX", "IAG.AX",
  "ASX.AX", "BEN.AX", "BOQ.AX",
  // Miners / Energy / Materials
  "BHP.AX", "RIO.AX", "FMG.AX", "S32.AX", "MIN.AX", "NST.AX", "EVN.AX",
  "PLS.AX", "IGO.AX", "WDS.AX", "STO.AX", "ORG.AX", "AMC.AX", "JHX.AX", "ALQ.AX",
  "BSL.AX", "ILU.AX",
  // Healthcare
  "CSL.AX", "RMD.AX", "COH.AX", "FPH.AX", "SHL.AX", "RHC.AX", "PME.AX", "SIG.AX",
  // Tech
  "XRO.AX", "WTC.AX", "TNE.AX", "ALU.AX", "CPU.AX", "TLS.AX", "REA.AX", "CAR.AX",
  "SEK.AX", "NXT.AX",
  // Retail / Consumer
  "WES.AX", "WOW.AX", "COL.AX", "JBH.AX", "HVN.AX", "PMV.AX", "LOV.AX", "BWX.AX",
  "DMP.AX", "TWE.AX", "A2M.AX",
  // REITs / Property
  "GMG.AX", "SCG.AX", "SGP.AX", "MGR.AX", "VCX.AX", "GPT.AX", "DXS.AX",
  // Industrials / Other
  "TCL.AX", "QAN.AX", "BXB.AX", "ALL.AX", "AMP.AX", "ORI.AX", "SVW.AX", "CIM.AX",
  "FLT.AX", "WOR.AX", "QUB.AX", "AGL.AX", "APA.AX", "AZJ.AX",
];

export const BENCHMARK = "^AXJO"; // ASX200 price index
