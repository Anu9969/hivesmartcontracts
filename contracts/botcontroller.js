/* eslint-disable no-await-in-loop */
/* eslint-disable valid-typeof */
/* eslint-disable max-len */
/* global actions, api */

const CONTRACT_NAME = 'botcontroller';

// this placeholder represents BEE tokens on Hive Engine, ENG on Steem Engine, and SSC on the testnet
// eslint-disable-next-line no-template-curly-in-string
const UTILITY_TOKEN_SYMBOL = "'${CONSTANTS.UTILITY_TOKEN_SYMBOL}$'";

// either SWAP.HIVE or STEEMP
const BASE_SYMBOL = "'${BASE_SYMBOL}$'";
const BASE_SYMBOL_PRECISION = 8;

// either HIVE or STEEM
const CHAIN_TYPE = "'${CHAIN_TYPE}$'";

actions.createSSC = async () => {
  const tableExists = await api.db.tableExists('users');
  if (tableExists === false) {
    await api.db.createTable('users', ['account']);
    await api.db.createTable('markets', ['account', 'symbol']);
    await api.db.createTable('params');

    const params = {};
    params.basicFee = '100';
    params.basicSettingsFee = '1';
    params.premiumFee = '100';
    params.premiumBaseStake = '1000';
    params.stakePerMarket = '200';
    params.basicDurationBlocks = 403200; // 14 days
    params.basicCooldownBlocks = 403200; // 14 days
    params.basicMinTickIntervalBlocks = 200; // 10 minutes
    params.premiumMinTickIntervalBlocks = 100; // 5 minutes
    params.basicMaxTicksPerBlock = 20;
    params.premiumMaxTicksPerBlock = 30;
    await api.db.insert('params', params);
  }
};

actions.updateParams = async (payload) => {
  if (api.sender !== api.owner) return;

  const {
    basicFee,
    basicSettingsFee,
    premiumFee,
    premiumBaseStake,
    stakePerMarket,
    basicDurationBlocks,
    basicCooldownBlocks,
    basicMinTickIntervalBlocks,
    premiumMinTickIntervalBlocks,
    basicMaxTicksPerBlock,
    premiumMaxTicksPerBlock,
  } = payload;

  const params = await api.db.findOne('params', {});

  if (basicFee && typeof basicFee === 'string' && !api.BigNumber(basicFee).isNaN() && api.BigNumber(basicFee).gte(0)) {
    params.basicFee = basicFee;
  }
  if (basicSettingsFee && typeof basicSettingsFee === 'string' && !api.BigNumber(basicSettingsFee).isNaN() && api.BigNumber(basicSettingsFee).gte(0)) {
    params.basicSettingsFee = basicSettingsFee;
  }
  if (premiumFee && typeof premiumFee === 'string' && !api.BigNumber(premiumFee).isNaN() && api.BigNumber(premiumFee).gte(0)) {
    params.premiumFee = premiumFee;
  }
  if (premiumBaseStake && typeof premiumBaseStake === 'string' && !api.BigNumber(premiumBaseStake).isNaN() && api.BigNumber(premiumBaseStake).gte(0)) {
    params.premiumBaseStake = premiumBaseStake;
  }
  if (stakePerMarket && typeof stakePerMarket === 'string' && !api.BigNumber(stakePerMarket).isNaN() && api.BigNumber(stakePerMarket).gte(0)) {
    params.stakePerMarket = stakePerMarket;
  }
  if (basicDurationBlocks && typeof basicDurationBlocks === 'number' && Number.isInteger(basicDurationBlocks) && basicDurationBlocks >= 0) {
    params.basicDurationBlocks = basicDurationBlocks;
  }
  if (basicCooldownBlocks && typeof basicCooldownBlocks === 'number' && Number.isInteger(basicCooldownBlocks) && basicCooldownBlocks >= 0) {
    params.basicCooldownBlocks = basicCooldownBlocks;
  }
  if (basicMinTickIntervalBlocks && typeof basicMinTickIntervalBlocks === 'number' && Number.isInteger(basicMinTickIntervalBlocks) && basicMinTickIntervalBlocks >= 0) {
    params.basicMinTickIntervalBlocks = basicMinTickIntervalBlocks;
  }
  if (premiumMinTickIntervalBlocks && typeof premiumMinTickIntervalBlocks === 'number' && Number.isInteger(premiumMinTickIntervalBlocks) && premiumMinTickIntervalBlocks >= 0) {
    params.premiumMinTickIntervalBlocks = premiumMinTickIntervalBlocks;
  }
  if (basicMaxTicksPerBlock && typeof basicMaxTicksPerBlock === 'number' && Number.isInteger(basicMaxTicksPerBlock) && basicMaxTicksPerBlock >= 0) {
    params.basicMaxTicksPerBlock = basicMaxTicksPerBlock;
  }
  if (premiumMaxTicksPerBlock && typeof premiumMaxTicksPerBlock === 'number' && Number.isInteger(premiumMaxTicksPerBlock) && premiumMaxTicksPerBlock >= 0) {
    params.premiumMaxTicksPerBlock = premiumMaxTicksPerBlock;
  }

  await api.db.update('params', params);
};

// ----- START UTILITY FUNCTIONS -----

// check that token transfers succeeded
const isTokenTransferVerified = (result, from, to, symbol, quantity, eventStr) => {
  if (result.errors === undefined
    && result.events && result.events.find(el => el.contract === 'tokens' && el.event === eventStr
      && el.data.from === from && el.data.to === to && el.data.quantity === quantity && el.data.symbol === symbol) !== undefined) {
    return true;
  }
  return false;
};

const calculateBalance = (balance, quantity, precision, add) => (add
  ? api.BigNumber(balance).plus(quantity).toFixed(precision)
  : api.BigNumber(balance).minus(quantity).toFixed(precision));

const countDecimals = value => api.BigNumber(value).dp();

const blockTimestamp = (CHAIN_TYPE === 'HIVE') ? api.hiveBlockTimestamp : api.steemBlockTimestamp;

const verifyUtilityTokenStake = async (amount, account) => {
  if (api.BigNumber(amount).lte(0)) {
    return true;
  }
  const utilityTokenStake = await api.db.findOneInTable('tokens', 'balances', { account: account, symbol: UTILITY_TOKEN_SYMBOL });
  if (utilityTokenStake && api.BigNumber(utilityTokenStake.stake).gte(amount)) {
    return true;
  }
  return false;
};

const verifyUtilityTokenBalance = async (amount, account) => {
  if (api.BigNumber(amount).lte(0)) {
    return true;
  }
  const utilityTokenBalance = await api.db.findOneInTable('tokens', 'balances', { account: account, symbol: UTILITY_TOKEN_SYMBOL });
  if (utilityTokenBalance && api.BigNumber(utilityTokenBalance.balance).gte(amount)) {
    return true;
  }
  return false;
};

const burnFee = async (amount, isSignedWithActiveKey) => {
  if (api.BigNumber(amount).gt(0)) {
    const res = await api.executeSmartContract('tokens', 'transfer', {
      to: 'null', symbol: UTILITY_TOKEN_SYMBOL, quantity: amount, isSignedWithActiveKey,
    });
    // check if the tokens were sent
    if (!isTokenTransferVerified(res, api.sender, 'null', UTILITY_TOKEN_SYMBOL, amount, 'transfer')) {
      return false;
    }
  }
  return true;
};

// ----- END UTILITY FUNCTIONS -----

actions.tick = async () => {
  if (api.assert(api.sender === 'null', 'not authorized')) {
    // get contract params
    const params = await api.db.findOne('params', {});
    const cutoffBasicBlock = api.blockNumber - params.basicMinTickIntervalBlocks;
    const cutoffPremiumBlock = api.blockNumber - params.premiumMinTickIntervalBlocks;

    // get some basic accounts that are ready to be ticked
    const pendingBasicTicks = await api.db.find(
      'users',
      {
        isEnabled: true,
        isPremium: false,
        lastTickBlock: {
          $lte: cutoffBasicBlock,
        },
      },
      params.basicMaxTicksPerBlock,
      0,
      [{index: '_id', descending: false}],
    );
    await tickUsers(params, pendingBasicTicks);

    // get some premium accounts that are ready to be ticked
    const pendingPremiumTicks = await api.db.find(
      'users',
      {
        isEnabled: true,
        isPremium: true,
        lastTickBlock: {
          $lte: cutoffPremiumBlock,
        },
      },
      params.premiumMaxTicksPerBlock,
      0,
      [{index: '_id', descending: false}],
    );
    await tickUsers(params, pendingPremiumTicks);
  }
};

const tickUsers = async (params, users) => {
  for (let i = 0; i < users.length; i += 1) {
    const user = users[i];

    // update duration and see if we need to go into cooldown
    if (!user.isPremium) {
      const tickInterval = api.blockNumber - user.lastTickBlock;
      user.timeLimitBlocks = user.timeLimitBlocks - tickInterval;
      if (user.timeLimitBlocks <= 0) {
        user.timeLimitBlocks = 0;
        user.isOnCooldown = true;
        user.isEnabled = false;
      }
    }
    else {
      // demote account if no longer eligible for premium
      const hasEnoughStake = await verifyUtilityTokenStake(params.premiumBaseStake, user.account);
      if (!hasEnoughStake) {
        user.isPremium = false;
      }
    }

    user.lastTickBlock = api.blockNumber;
    await api.db.update('users', user);
  }
};

actions.upgrade = async (payload) => {
  const {
    isSignedWithActiveKey,
  } = payload;

  const params = await api.db.findOne('params', {});
  const hasEnoughStake = await verifyUtilityTokenStake(params.premiumBaseStake, api.sender);

  if (api.assert(hasEnoughStake, 'you do not have enough tokens staked')
    && api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')) {
    // check if this user exists
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      // check if this user is already premium
      if (api.assert(!user.isPremium, 'user is already premium')) {
        if (!user.isPremiumFeePaid) {
          // burn the upgrade fee
          const authorizedUpgrade = await verifyUtilityTokenBalance(params.premiumFee, api.sender);
          if (!api.assert(authorizedUpgrade, 'you must have enough tokens to cover the premium upgrade fee')) {
            return false;
          }
          if (!(await burnFee(params.premiumFee, isSignedWithActiveKey))) {
            return false;
          }
        }

        user.isPremiumFeePaid = true;
        user.isPremium = true;
        if (user.isOnCooldown) {
          user.timeLimitBlocks = params.basicDurationBlocks;
        }
        user.isOnCooldown = false;
        user.lastTickBlock = api.blockNumber;

        await api.db.update('users', user);

        api.emit('upgrade', {
          account: api.sender
        });
        return true;
      }
    }
  }
  return false;
};

actions.turnOff = async (payload) => {
  const {
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      if (api.assert(user.isEnabled, 'account already turned off')) {
        // update duration and see if we need to go into cooldown
        if (!user.isPremium) {
          const tickInterval = api.blockNumber - user.lastTickBlock;
          user.timeLimitBlocks = user.timeLimitBlocks - tickInterval;
          if (user.timeLimitBlocks <= 0) {
            user.timeLimitBlocks = 0;
            user.isOnCooldown = true;
          }
        }

        user.isEnabled = false;
        user.lastTickBlock = api.blockNumber;

        await api.db.update('users', user);

        // TODO: in future, maybe pull any orders the bot has placed for this user?
        api.emit('turnOff', {
          account: api.sender
        });
      }
    }
  }
};

actions.turnOn = async (payload) => {
  const {
    isSignedWithActiveKey,
  } = payload;

  const params = await api.db.findOne('params', {});

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      const lastTickBlock = user.lastTickBlock;
      const currentTickBlock = api.blockNumber;
      const tickInterval = currentTickBlock - lastTickBlock;
      if (api.assert(!user.isEnabled, 'account already turned on')
        && api.assert(user.isPremium || !user.isOnCooldown || (user.isOnCooldown && tickInterval >= params.basicCooldownBlocks), 'cooldown duration not expired')) {
        user.isEnabled = true;
        if (user.isOnCooldown) {
          user.timeLimitBlocks = params.basicDurationBlocks;
        }
        user.isOnCooldown = false;
        user.lastTickBlock = currentTickBlock;

        await api.db.update('users', user);

        api.emit('turnOn', {
          account: api.sender
        });
      }
    }
  }
};

actions.disableMarket = async (payload) => {
  const {
    symbol,
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')
    && api.assert(symbol && typeof symbol === 'string' && symbol !== BASE_SYMBOL, 'invalid params')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      const market = await api.db.findOne('markets', { account: api.sender, symbol: symbol });
      if (api.assert(market !== null, 'market must exist')) {
        if (market.isEnabled) {
          market.isEnabled = false;

          await api.db.update('markets', market);

          api.emit('disableMarket', {
            account: api.sender,
            symbol: symbol,
          });
        }
      }
    }
  }
};

actions.enableMarket = async (payload) => {
  const {
    symbol,
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')
    && api.assert(symbol && typeof symbol === 'string' && symbol !== BASE_SYMBOL, 'invalid params')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      const market = await api.db.findOne('markets', { account: api.sender, symbol: symbol });
      if (api.assert(market !== null, 'market must exist')) {
        if (!market.isEnabled) {
          // if user was premium but got demoted, they may have too many markets
          const authorizedAction = (user.isPremium || (user.markets === 1)) ? true : false;
          if (api.assert(authorizedAction, 'user has too many markets; premium upgrade required')) {
            // ensure user has enough tokens staked
            const params = await api.db.findOne('params', {});
            let requiredStake = api.BigNumber(params.stakePerMarket).multipliedBy(user.markets);
            if (user.isPremium) {
              requiredStake = requiredStake.plus(params.premiumBaseStake);
            }
            const hasEnoughStake = await verifyUtilityTokenStake(requiredStake, api.sender);
            if (api.assert(hasEnoughStake, `must stake more ${UTILITY_TOKEN_SYMBOL} to enable market`)) {
              market.isEnabled = true;

              await api.db.update('markets', market);

              api.emit('enableMarket', {
                account: api.sender,
                symbol: symbol,
              });
            }
          }
        }
      }
    }
  }
};

actions.removeMarket = async (payload) => {
  const {
    symbol,
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')
    && api.assert(symbol && typeof symbol === 'string' && symbol !== BASE_SYMBOL, 'invalid params')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      const market = await api.db.findOne('markets', { account: api.sender, symbol: symbol });
      if (api.assert(market !== null, 'market must exist')) {
        await api.db.remove('markets', market);

        // decrease user's market count
        user.markets -= 1;
        await api.db.update('users', user);

        api.emit('removeMarket', {
          account: api.sender,
          symbol: symbol,
        });
      }
    }
  }
};

actions.updateMarket = async (payload) => {
  const {
    symbol,
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')
    && api.assert(symbol && typeof symbol === 'string' && symbol !== BASE_SYMBOL, 'invalid params')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      // if user is not premium, a settings change fee must be paid
      const params = await api.db.findOne('params', {});
      let authorizedAction = false;
      if (user.isPremium) {
        authorizedAction = true;
      } else {
        authorizedAction = await verifyUtilityTokenBalance(params.basicSettingsFee, api.sender);
      }
      if (api.assert(authorizedAction, 'you must have enough tokens to cover the settings change fee')) {
        const market = await api.db.findOne('markets', { account: api.sender, symbol: symbol });
        if (api.assert(market !== null, 'market must exist')) {
          // TODO: move this to updateMarketInternal
          /*if (!user.isPremium) {
            // burn the settings change fee
            if (!(await burnFee(params.basicSettingsFee, isSignedWithActiveKey))) {
              return false;
            }
          }*/
          return await updateMarketInternal(payload, market, !user.isPremium, params);
        }
      }
    }
  }
  return false;
};

const updateMarketInternal = async (payload, market, shouldPayFee, params) => {
  const {
    maxBidPrice,
    minSellPrice,
    maxBaseToSpend,
    minBaseToSpend,
    maxTokensToSell,
    minTokensToSell,
    priceIncrement,
    minSpread,
  } = payload;

  if (api.assert(maxBidPrice === undefined || (maxBidPrice && typeof maxBidPrice === 'string' && !api.BigNumber(maxBidPrice).isNaN() && api.BigNumber(maxBidPrice).gt(0) && countDecimals(maxBidPrice) <= BASE_SYMBOL_PRECISION), 'invalid params')) {
    // TODO: finish me
  }
};

actions.addMarket = async (payload) => {
  const {
    symbol,
    isSignedWithActiveKey,
  } = payload;

  if (api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')
    && api.assert(symbol && typeof symbol === 'string' && symbol !== BASE_SYMBOL, 'invalid params')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user !== null, 'user not registered')) {
      const token = await api.db.findOneInTable('tokens', 'tokens', { symbol });
      if (api.assert(token !== null, 'symbol must exist')) {
        const market = await api.db.findOne('markets', { account: api.sender, symbol: symbol });
        if (api.assert(market === null, 'market already added')) {
          // check to see if user is able to add another market
          const authorizedAddition = (user.isPremium || (user.markets === 0)) ? true : false;
          if (api.assert(authorizedAddition, 'not allowed to add another market')) {
            // finally, user must have enough tokens staked
            const params = await api.db.findOne('params', {});
            let requiredStake = api.BigNumber(params.stakePerMarket).multipliedBy(user.markets + 1);
            if (user.isPremium) {
              requiredStake = requiredStake.plus(params.premiumBaseStake);
            }
            const hasEnoughStake = await verifyUtilityTokenStake(requiredStake, api.sender);
            if (api.assert(hasEnoughStake, `must stake more ${UTILITY_TOKEN_SYMBOL} to add a market`)) {
              const blockDate = new Date(`${blockTimestamp}.000Z`);
              const creationTimestamp = blockDate.getTime();

              const newMarket = {
                account: api.sender,
                symbol: symbol,
                precision: token.precision,
                strategy: 1,
                maxBidPrice: '1000',
                minSellPrice: '0.00000001',
                maxBaseToSpend: '100',
                minBaseToSpend: '1',
                maxTokensToSell: '100',
                minTokensToSell: '1',
                priceIncrement: '0.00001',
                minSpread: '0.00000001',
                isEnabled: true,
                creationTimestamp,
                creationBlock: api.blockNumber,
              };

              await api.db.insert('markets', newMarket);

              api.emit('addMarket', {
                account: api.sender,
                symbol: symbol,
              });

              // increase user's market count
              user.markets += 1;
              await api.db.update('users', user);

              // do initial settings update
              await updateMarketInternal(payload, newMarket, false, params);
            }
          }
        }
      }
    }
  }
};

actions.register = async (payload) => {
  const {
    isSignedWithActiveKey,
  } = payload;

  const params = await api.db.findOne('params', {});
  const authorizedRegistration = await verifyUtilityTokenBalance(params.basicFee, api.sender);

  if (api.assert(authorizedRegistration, 'you must have enough tokens to cover the registration fee')
    && api.assert(isSignedWithActiveKey === true, 'you must use a custom_json signed with your active key')) {
    // check if this user is already registered
    const user = await api.db.findOne('users', { account: api.sender });
    if (api.assert(user === null, 'user already registered')) {
      // burn the registration fee
      if (!(await burnFee(params.basicFee, isSignedWithActiveKey))) {
        return false;
      }

      const blockDate = new Date(`${blockTimestamp}.000Z`);
      const creationTimestamp = blockDate.getTime();

      const newUser = {
        account: api.sender,
        isPremium: false,
        isPremiumFeePaid: false,
        isOnCooldown: false,
        isEnabled: true,
        markets: 0,
        timeLimitBlocks: params.basicDurationBlocks,
        lastTickBlock: api.blockNumber,
        creationTimestamp,
        creationBlock: api.blockNumber,
      };

      await api.db.insert('users', newUser);

      api.emit('register', {
        account: api.sender
      });
      return true;
    }
  }
  return false;
};
