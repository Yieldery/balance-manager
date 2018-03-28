import {
  apiGetEthplorerAddressInfo,
  apiGetEtherscanAccountTransactions,
  apiGetPrices
} from '../helpers/api';
import {
  parseError,
  parseTransactionsPrices,
  parseAccountBalances,
  parsePricesObject,
  parseEthplorerAddressInfo
} from '../helpers/parsers';
import lang from '../languages';
import { saveLocal, getLocal } from '../helpers/utilities';
import { web3SetProvider } from '../helpers/web3';
import { notificationShow } from './_notification';
import nativeCurrencies from '../libraries/native-currencies.json';

// -- Constants ------------------------------------------------------------- //

const ACCOUNT_GET_ACCOUNT_TRANSACTIONS_REQUEST = 'account/ACCOUNT_GET_ACCOUNT_TRANSACTIONS_REQUEST';
const ACCOUNT_GET_ACCOUNT_TRANSACTIONS_SUCCESS = 'account/ACCOUNT_GET_ACCOUNT_TRANSACTIONS_SUCCESS';
const ACCOUNT_GET_ACCOUNT_TRANSACTIONS_FAILURE = 'account/ACCOUNT_GET_ACCOUNT_TRANSACTIONS_FAILURE';

const ACCOUNT_GET_ACCOUNT_BALANCES_REQUEST = 'account/ACCOUNT_GET_ACCOUNT_BALANCES_REQUEST';
const ACCOUNT_GET_ACCOUNT_BALANCES_SUCCESS = 'account/ACCOUNT_GET_ACCOUNT_BALANCES_SUCCESS';
const ACCOUNT_GET_ACCOUNT_BALANCES_FAILURE = 'account/ACCOUNT_GET_ACCOUNT_BALANCES_FAILURE';

const ACCOUNT_GET_NATIVE_PRICES_REQUEST = 'account/ACCOUNT_GET_NATIVE_PRICES_REQUEST';
const ACCOUNT_GET_NATIVE_PRICES_SUCCESS = 'account/ACCOUNT_GET_NATIVE_PRICES_SUCCESS';
const ACCOUNT_GET_NATIVE_PRICES_FAILURE = 'account/ACCOUNT_GET_NATIVE_PRICES_FAILURE';

const ACCOUNT_CHANGE_NATIVE_CURRENCY = 'account/ACCOUNT_CHANGE_NATIVE_CURRENCY';
const ACCOUNT_UPDATE_WEB3_NETWORK = 'account/ACCOUNT_UPDATE_WEB3_NETWORK';
const ACCOUNT_UPDATE_ACCOUNT_ADDRESS_REQUEST = 'account/ACCOUNT_UPDATE_ACCOUNT_ADDRESS_REQUEST';

const ACCOUNT_PARSE_TRANSACTION_PRICES_REQUEST = 'account/ACCOUNT_PARSE_TRANSACTION_PRICES_REQUEST';
const ACCOUNT_PARSE_TRANSACTION_PRICES_SUCCESS = 'account/ACCOUNT_PARSE_TRANSACTION_PRICES_SUCCESS';
const ACCOUNT_PARSE_TRANSACTION_PRICES_FAILURE = 'account/ACCOUNT_PARSE_TRANSACTION_PRICES_FAILURE';

const ACCOUNT_CLEAR_STATE = 'account/ACCOUNT_CLEAR_STATE';

// -- Actions --------------------------------------------------------------- //

let getPricesInterval = null;

export const accountParseTransactionPrices = () => (dispatch, getState) => {
  dispatch({ type: ACCOUNT_PARSE_TRANSACTION_PRICES_REQUEST });
  const currentTransactions = getState().account.transactions;
  const address = getState().account.accountInfo.address;
  const nativeCurrency = getState().account.nativeCurrency;
  parseTransactionsPrices(currentTransactions, nativeCurrency, address)
    .then(transactions => {
      dispatch({
        type: ACCOUNT_PARSE_TRANSACTION_PRICES_SUCCESS,
        payload: transactions
      });
    })
    .catch(error => {
      dispatch({ type: ACCOUNT_PARSE_TRANSACTION_PRICES_FAILURE });
      const message = parseError(error);
      dispatch(notificationShow(message, true));
    });
};

export const accountGetAccountTransactions = () => (dispatch, getState) => {
  const { accountAddress, web3Network } = getState().account;
  let cachedTransactions = [];
  const accountLocal = getLocal(accountAddress) || null;
  if (accountLocal) {
    cachedTransactions = [...accountLocal.transactions];
  }
  dispatch({
    type: ACCOUNT_GET_ACCOUNT_TRANSACTIONS_REQUEST,
    payload: { transactions: cachedTransactions, fetchingTransactions: !accountLocal }
  });
  apiGetEtherscanAccountTransactions(accountAddress, web3Network)
    .then(transactions => {
      dispatch({ type: ACCOUNT_GET_ACCOUNT_TRANSACTIONS_SUCCESS });
      dispatch(accountParseTransactionPrices(transactions));
    })
    .catch(error => {
      // const message = parseError(error);
      dispatch(notificationShow(lang.t('notification.error.failed_get_account_tx'), true));
      dispatch({ type: ACCOUNT_GET_ACCOUNT_TRANSACTIONS_FAILURE });
    });
};

export const accountGetAccountBalances = address => (dispatch, getState) => {
  const { web3Network, accountInfo, accountType } = getState().account;
  let cachedAccount = { ...accountInfo };
  let cachedTransactions = [];
  const accountLocal = getLocal(address) || null;
  if (accountLocal) {
    cachedAccount = {
      ...cachedAccount,
      assets: accountLocal.balances.assets,
      total: accountLocal.balances.total
    };
    cachedTransactions = [...accountLocal.transactions];
  }
  dispatch({
    type: ACCOUNT_GET_ACCOUNT_BALANCES_REQUEST,
    payload: {
      accountInfo: cachedAccount,
      transactions: cachedTransactions,
      fetching: !accountLocal
    }
  });
  apiGetEthplorerAddressInfo(address, web3Network)
    .then(accountInfo => {
      accountInfo = { ...accountInfo, accountType };
      dispatch({ type: ACCOUNT_GET_ACCOUNT_BALANCES_SUCCESS });
      dispatch(accountGetNativePrices(accountInfo));
      if (accountInfo.txCount) dispatch(accountGetAccountTransactions());
    })
    .catch(error => {
      const message = parseError(error);
      dispatch(notificationShow(message, true));
      dispatch({ type: ACCOUNT_GET_ACCOUNT_BALANCES_FAILURE });
    });
};

export const accountUpdateWeb3Network = network => dispatch => {
  web3SetProvider(`https://${network}.infura.io/`);
  dispatch({ type: ACCOUNT_UPDATE_WEB3_NETWORK, payload: network });
};

export const accountClearIntervals = () => dispatch => {
  clearInterval(getPricesInterval);
};

export const accountUpdateAccountAddress = (accountAddress, accountType) => dispatch => {
  dispatch({
    type: ACCOUNT_UPDATE_ACCOUNT_ADDRESS_REQUEST,
    payload: { accountAddress, accountType }
  });
  if (accountAddress) dispatch(accountGetAccountBalances(accountAddress));
};

export const accountGetNativePrices = accountInfo => (dispatch, getState) => {
  const assetSymbols = accountInfo.assets.map(asset => asset.symbol);
  const getPrices = () => {
    dispatch({
      type: ACCOUNT_GET_NATIVE_PRICES_REQUEST,
      payload: getState().account.nativeCurrency
    });
    apiGetPrices(assetSymbols)
      .then(({ data }) => {
        const nativePriceRequest = getState().account.nativePriceRequest;
        const nativeCurrency = getState().account.nativeCurrency;
        if (nativeCurrency === nativePriceRequest) {
          const prices = parsePricesObject(data, assetSymbols, nativeCurrency);
          const parsedAccountInfo = parseAccountBalances(accountInfo, prices);
          console.log(parsedAccountInfo);
          dispatch({
            type: ACCOUNT_GET_NATIVE_PRICES_SUCCESS,
            payload: { accountInfo: parsedAccountInfo, prices }
          });
        }
      })
      .catch(error => {
        dispatch({ type: ACCOUNT_GET_NATIVE_PRICES_FAILURE });
        const message = parseError(error);
        dispatch(notificationShow(message, true));
      });
  };
  getPrices();
  clearInterval(getPricesInterval);
  getPricesInterval = setInterval(getPrices, 15000); // 15secs
};

export const accountChangeNativeCurrency = nativeCurrency => (dispatch, getState) => {
  saveLocal('native_currency', nativeCurrency);
  let prices = getState().account.prices || getLocal('native_prices');
  const selected = nativeCurrencies[nativeCurrency];
  let newPrices = { ...prices, selected };
  let oldAccountInfo = getState().account.accountInfo;
  const newAccountInfo = parseAccountBalances(oldAccountInfo, newPrices);
  const accountInfo = { ...oldAccountInfo, ...newAccountInfo };
  dispatch({
    type: ACCOUNT_CHANGE_NATIVE_CURRENCY,
    payload: { nativeCurrency, prices: newPrices, accountInfo }
  });
  dispatch(accountParseTransactionPrices());
};

export const accountClearState = () => ({ type: ACCOUNT_CLEAR_STATE });

// -- Reducer --------------------------------------------------------------- //
const INITIAL_STATE = {
  nativePriceRequest: getLocal('native_currency') || 'USD',
  nativeCurrency: getLocal('native_currency') || 'USD',
  prices: {},
  web3Network: 'mainnet',
  accountType: '',
  accountAddress: '',
  accountInfo: parseEthplorerAddressInfo(null),
  transactions: [],
  fetchingTransactions: false,
  fetching: false
};

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case ACCOUNT_UPDATE_ACCOUNT_ADDRESS_REQUEST:
      return {
        ...state,
        accountType: action.payload.accountType,
        accountAddress: action.payload.accountAddress,
        transactions: []
      };
    case ACCOUNT_GET_ACCOUNT_TRANSACTIONS_REQUEST:
      return {
        ...state,
        fetchingTransactions: action.payload.fetchingTransactions,
        transactions: action.payload.transactions
      };
    case ACCOUNT_GET_ACCOUNT_TRANSACTIONS_SUCCESS:
    case ACCOUNT_GET_ACCOUNT_TRANSACTIONS_FAILURE:
      return { ...state, fetchingTransactions: false };
    case ACCOUNT_PARSE_TRANSACTION_PRICES_SUCCESS:
      return {
        ...state,
        transactions: action.payload
      };
    case ACCOUNT_PARSE_TRANSACTION_PRICES_REQUEST:
    case ACCOUNT_PARSE_TRANSACTION_PRICES_FAILURE:
      return {
        ...state
      };
    case ACCOUNT_GET_ACCOUNT_BALANCES_REQUEST:
      return {
        ...state,
        fetching: action.payload.fetching,
        accountInfo: action.payload.accountInfo,
        transactions: action.payload.transactions
      };
    case ACCOUNT_GET_ACCOUNT_BALANCES_SUCCESS:
    case ACCOUNT_GET_ACCOUNT_BALANCES_FAILURE:
      return { ...state, fetching: false };
    case ACCOUNT_GET_NATIVE_PRICES_REQUEST:
      return {
        ...state,
        nativePriceRequest: action.payload
      };
    case ACCOUNT_GET_NATIVE_PRICES_SUCCESS:
      return {
        ...state,
        nativePriceRequest: '',
        prices: action.payload.prices,
        accountInfo: action.payload.accountInfo
      };
    case ACCOUNT_GET_NATIVE_PRICES_FAILURE:
      return {
        ...state,
        nativePriceRequest: ''
      };
    case ACCOUNT_CHANGE_NATIVE_CURRENCY:
      return {
        ...state,
        nativeCurrency: action.payload.nativeCurrency,
        prices: action.payload.prices,
        accountInfo: action.payload.accountInfo
      };
    case ACCOUNT_CLEAR_STATE:
      return {
        ...state,
        ...INITIAL_STATE
      };
    default:
      return state;
  }
};
