import { assert } from 'ts-essentials';
import {
  CHAIN_ID_AVALANCHE,
  CHAIN_ID_BINANCE,
  CHAIN_ID_FANTOM,
  CHAIN_ID_MAINNET,
  CHAIN_ID_POLYGON,
} from '../../../src/lib/constants';
import {
  GasRefundDeduplicationStartEpoch,
  GasRefundTxOriginCheckStartEpoch,
} from '../../../src/lib/gas-refund';
import { thegraphClient } from '../data-providers-clients';
import StakesTracker from '../staking/stakes-tracker';
import {
  queryPaginatedData,
  QueryPaginatedDataParams,
  sliceCalls,
} from '../utils';

// Note: txGasUsed from thegraph is unsafe as it's actually txGasLimit https://github.com/graphprotocol/graph-node/issues/2619
const SwapsQuery = `
query ($number_gte: BigInt, $number_lt: BigInt, $first: Int, $skip: Int, $txOrigins: [Bytes!]!) {
	swaps(
		first: $first
    skip: $skip
		orderBy: blockNumber
		orderDirection: asc
		where: {
			timestamp_gte: $number_gte
			timestamp_lt: $number_lt
      txOrigin_in: $txOrigins
		}
	) {
    txHash
		txOrigin
		txGasPrice
		blockNumber
    timestamp
    initiator
	}
}
`;
const SubgraphURLs: { [network: number]: string } = {
  [CHAIN_ID_MAINNET]:
    'https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph',
  [CHAIN_ID_AVALANCHE]:
    'https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-avalanche',
  [CHAIN_ID_BINANCE]:
    'https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-bsc',
  [CHAIN_ID_POLYGON]:
    'https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-polygon',
  [CHAIN_ID_FANTOM]:
    'https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-fantom',
};

interface GetSuccessSwapsInput {
  startTimestamp: number;
  endTimestamp: number;
  chainId: number;
  epoch: number;
}

// get filtered by accounts swaps from the graphql endpoint
export async function getSuccessfulSwaps({
  startTimestamp,
  endTimestamp,
  chainId,
  epoch,
}: GetSuccessSwapsInput): Promise<SwapData[]> {
  const subgraphURL = SubgraphURLs[chainId];

  const fetchPaginatedSwaps = async ({
    skip,
    pageSize,
  }: QueryPaginatedDataParams) => {
    const fetchSwapsSlicedByTxOrigins = async (txOriginsSlice: string[]) => {
      const variables = {
        number_gte: startTimestamp,
        number_lt: endTimestamp,
        skip,
        pageSize,
        txOrigins: txOriginsSlice,
      };

      const { data } = await thegraphClient.post<SwapsGQLRespose>(subgraphURL, {
        query: SwapsQuery,
        variables,
      });

      const swaps = data.data.swaps;

      return swaps;
    };

    const swaps = (
      await Promise.all(
        sliceCalls({
          inputArray: StakesTracker.getInstance().getStakersAddresses(),
          execute: fetchSwapsSlicedByTxOrigins,
          sliceLength: 100,
        }),
      )
    ).flat();

    return swaps;
  };

  const swaps = await queryPaginatedData(fetchPaginatedSwaps, 100);

  if (epoch < GasRefundTxOriginCheckStartEpoch) {
    return swaps;
  }

  const swapsWithTxOriginEqMsgSender = swaps.filter(
    swap => swap.initiator.toLowerCase() === swap.txOrigin.toLowerCase(),
  );

  if (epoch < GasRefundDeduplicationStartEpoch) {
    return swapsWithTxOriginEqMsgSender;
  }

  const uniqSwapTxHashes = [
    ...new Set(swapsWithTxOriginEqMsgSender.map(swap => swap.txHash)),
  ];

  assert(
    uniqSwapTxHashes.length === swapsWithTxOriginEqMsgSender.length,
    'duplicates found',
  );

  return swapsWithTxOriginEqMsgSender;
}

interface SwapsGQLRespose {
  data: { swaps: SwapData[] };
}

export interface SwapData {
  txHash: string;
  txOrigin: string;
  initiator: string;
  txGasPrice: string;
  blockNumber: string;
  timestamp: string;
}
