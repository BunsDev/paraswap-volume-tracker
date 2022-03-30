import { HistoricalPrice, StakedPSPByAddress } from '../types';
import { computeSuccessfulSwapsTxFeesRefund as computeGasRefundSuccessSwaps } from './successful-swap-tx-indexing';

// @TODO: index more transactions (failed swap tx, staking tx)
export async function computeGasRefundAllTxs({
  chainId,
  startTimestamp,
  endTimestamp,
  pspNativeCurrencyDailyRate,
  epoch,
  stakes,
}: {
  chainId: number;
  startTimestamp: number;
  endTimestamp: number;
  pspNativeCurrencyDailyRate: HistoricalPrice;
  epoch: number;
  stakes: StakedPSPByAddress;
}) {
  await computeGasRefundSuccessSwaps({
    chainId,
    startTimestamp,
    endTimestamp,
    pspNativeCurrencyDailyRate,
    epoch,
    stakes,
  });
}
