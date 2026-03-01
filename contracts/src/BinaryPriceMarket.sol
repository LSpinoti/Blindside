// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract BinaryPriceMarket {
    error DirectTransfersDisabled();
    error InvalidAmount();
    error InvalidCutoffTime();
    error InvalidLimitPrice();
    error InvalidSlippage();
    error MarketClosed();
    error MarketStillOpen();
    error NothingToClaim();
    error NotOrderOwner();
    error OraclePriceOutOfRange();
    error OrderInactive();
    error TransferFailed();

    event PositionOpened(address burner, bool side, uint256 amount);
    event MarketResolved(
        uint64 indexed epochId,
        bool outcome,
        int64 settlementPrice,
        uint256 resolvedAt
    );
    event LimitOrderPlaced(
        uint64 indexed orderId,
        address indexed trader,
        bool side,
        uint8 limitPriceBps,
        uint8 maxSlippageBps,
        uint256 amount
    );
    event LimitOrderCancelled(
        uint64 indexed orderId,
        address indexed trader,
        uint256 refund
    );

    uint8 private constant MIN_LIMIT_PRICE_BPS = 1;
    uint8 private constant MAX_LIMIT_PRICE_BPS = 99;
    uint8 private constant MAX_SLIPPAGE_BPS = 25;
    uint8 private constant ORDER_BOOK_DEPTH = 4;
    uint64 private constant MARKET_DURATION = 1 hours;
    uint64 private constant MAX_PYTH_DELAY = 15 minutes;

    struct LimitOrder {
        address owner;
        bool side;
        uint8 priceBps;
        uint8 slippageBps;
        uint256 amount;
        bool active;
    }

    IPyth public immutable PYTH;
    bytes32 public immutable PRICE_FEED_ID;
    string public question;
    int64 public strikeE8;
    uint64 public cutoffTime;
    uint64 public currentEpochId;

    uint256 public yesPool;
    uint256 public noPool;
    bool public resolvedOutcome;
    int64 public settlementPrice;
    uint256 public resolvedAt;

    mapping(address => uint256) public yesStake;
    mapping(address => uint256) public noStake;
    mapping(uint64 => LimitOrder) public limitOrders;
    mapping(uint8 => uint256) public yesBidBook;
    mapping(uint8 => uint256) public yesAskBook;
    mapping(address => uint256) public openYesOrders;
    mapping(address => uint256) public openNoOrders;
    mapping(address => uint256) public openOrderValue;

    mapping(uint8 => uint64[]) private yesBidOrderIds;
    mapping(uint8 => uint64[]) private yesAskOrderIds;
    mapping(uint8 => uint256) private yesBidCursor;
    mapping(uint8 => uint256) private yesAskCursor;

    mapping(address => bool) private trackedParticipant;
    address[] private activeParticipants;
    uint64[] private activeOrderIds;

    uint64 public nextOrderId = 1;

    constructor(
        string memory marketQuestion,
        int64 strikePriceE8,
        uint64 initialCutoffTime,
        address pythAddress,
        bytes32 feedId
    ) {
        if (strikePriceE8 <= 0) {
            revert OraclePriceOutOfRange();
        }
        if (
            initialCutoffTime <= block.timestamp ||
            initialCutoffTime % MARKET_DURATION != 0
        ) {
            revert InvalidCutoffTime();
        }

        PYTH = IPyth(pythAddress);
        PRICE_FEED_ID = feedId;
        question = marketQuestion;
        strikeE8 = strikePriceE8;
        cutoffTime = initialCutoffTime;
        currentEpochId = 1;
    }

    receive() external payable {
        revert DirectTransfersDisabled();
    }

    function buyYes() external payable {
        _openPosition(msg.sender, true, msg.value);
    }

    function buyNo() external payable {
        _openPosition(msg.sender, false, msg.value);
    }

    function placeLimitOrder(
        bool side,
        uint8 limitPriceBps,
        uint8 maxSlippageBps
    ) external payable returns (uint64 orderId) {
        _requireMarketOpen();

        if (msg.value == 0) {
            revert InvalidAmount();
        }
        if (
            limitPriceBps < MIN_LIMIT_PRICE_BPS ||
            limitPriceBps > MAX_LIMIT_PRICE_BPS
        ) {
            revert InvalidLimitPrice();
        }
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) {
            revert InvalidSlippage();
        }

        uint256 remaining = _matchOrder(
            msg.sender,
            side,
            _executionLimit(side, limitPriceBps, maxSlippageBps),
            msg.value
        );

        if (remaining == 0) {
            return 0;
        }

        orderId = nextOrderId;
        nextOrderId += 1;

        limitOrders[orderId] = LimitOrder({
            owner: msg.sender,
            side: side,
            priceBps: limitPriceBps,
            slippageBps: maxSlippageBps,
            amount: remaining,
            active: true
        });

        activeOrderIds.push(orderId);
        if (side) {
            yesBidOrderIds[limitPriceBps].push(orderId);
            yesBidBook[limitPriceBps] += remaining;
            openYesOrders[msg.sender] += remaining;
        } else {
            yesAskOrderIds[limitPriceBps].push(orderId);
            yesAskBook[limitPriceBps] += remaining;
            openNoOrders[msg.sender] += remaining;
        }
        openOrderValue[msg.sender] += remaining;

        emit LimitOrderPlaced(
            orderId,
            msg.sender,
            side,
            limitPriceBps,
            maxSlippageBps,
            remaining
        );
    }

    function cancelLimitOrder(uint64 orderId) external {
        LimitOrder storage order = limitOrders[orderId];
        if (!order.active || order.amount == 0) {
            revert OrderInactive();
        }
        if (order.owner != msg.sender) {
            revert NotOrderOwner();
        }

        order.active = false;

        if (order.side) {
            yesBidBook[order.priceBps] -= order.amount;
            openYesOrders[msg.sender] -= order.amount;
        } else {
            yesAskBook[order.priceBps] -= order.amount;
            openNoOrders[msg.sender] -= order.amount;
        }
        openOrderValue[msg.sender] -= order.amount;

        uint256 refund = order.amount;
        order.amount = 0;

        _pay(msg.sender, refund);

        emit LimitOrderCancelled(orderId, msg.sender, refund);
    }

    function resolve(bytes[] calldata updateData) external payable {
        if (block.timestamp < cutoffTime) {
            revert MarketStillOpen();
        }

        uint64 settlingEpoch = currentEpochId;
        uint64 settlementCutoff = cutoffTime;

        uint256 fee = PYTH.getUpdateFee(updateData);
        bytes32[] memory priceIds = new bytes32[](1);
        priceIds[0] = PRICE_FEED_ID;

        PythStructs.PriceFeed[] memory priceFeeds = PYTH.parsePriceFeedUpdatesUnique{
            value: fee
        }(
            updateData,
            priceIds,
            settlementCutoff,
            settlementCutoff + MAX_PYTH_DELAY
        );

        int64 normalizedPrice = _normalizeToE8(priceFeeds[0].price);
        if (normalizedPrice <= 0) {
            revert OraclePriceOutOfRange();
        }

        bool outcome = normalizedPrice > strikeE8;
        bool hasCounterparty = yesPool > 0 && noPool > 0;
        uint256 winningPool = outcome ? yesPool : noPool;
        uint256 totalPool = yesPool + noPool;

        for (uint256 index = 0; index < activeParticipants.length; index += 1) {
            address trader = activeParticipants[index];
            uint256 traderYes = yesStake[trader];
            uint256 traderNo = noStake[trader];
            uint256 payout;

            if (hasCounterparty) {
                uint256 winnerStake = outcome ? traderYes : traderNo;
                if (winnerStake > 0 && winningPool > 0) {
                    payout = (winnerStake * totalPool) / winningPool;
                }
            } else {
                payout = traderYes + traderNo;
            }

            yesStake[trader] = 0;
            noStake[trader] = 0;
            trackedParticipant[trader] = false;

            if (payout > 0) {
                _pay(trader, payout);
            }
        }
        delete activeParticipants;

        _clearRestingOrders();

        resolvedOutcome = outcome;
        settlementPrice = normalizedPrice;
        resolvedAt = block.timestamp;
        yesPool = 0;
        noPool = 0;

        emit MarketResolved(
            settlingEpoch,
            resolvedOutcome,
            settlementPrice,
            resolvedAt
        );

        currentEpochId = settlingEpoch + 1;
        strikeE8 = normalizedPrice;
        cutoffTime = _nextCutoffTimestamp(uint64(block.timestamp));

        uint256 refund = msg.value - fee;
        if (refund > 0) {
            _pay(msg.sender, refund);
        }
    }

    function claim() external pure {
        revert NothingToClaim();
    }

    function previewPayout(address) external pure returns (uint256) {
        return 0;
    }

    function openOrderSummaryOf(
        address trader
    )
        external
        view
        returns (uint256 yesValue, uint256 noValue, uint256 totalLocked)
    {
        yesValue = openYesOrders[trader];
        noValue = openNoOrders[trader];
        totalLocked = openOrderValue[trader];
    }

    function getOrderBook()
        external
        view
        returns (
            uint8[4] memory bidPrices,
            uint256[4] memory bidSizes,
            uint8[4] memory askPrices,
            uint256[4] memory askSizes
        )
    {
        uint256 bidSlot;
        for (uint256 price = MAX_LIMIT_PRICE_BPS; ; price -= 1) {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 levelSize = yesBidBook[uint8(price)];
            if (levelSize > 0) {
                // forge-lint: disable-next-line(unsafe-typecast)
                bidPrices[bidSlot] = uint8(price);
                bidSizes[bidSlot] = levelSize;
                bidSlot += 1;
                if (bidSlot == uint256(ORDER_BOOK_DEPTH)) {
                    break;
                }
            }

            if (price == MIN_LIMIT_PRICE_BPS) {
                break;
            }
        }

        uint256 askSlot;
        for (
            uint256 price = MIN_LIMIT_PRICE_BPS;
            price <= MAX_LIMIT_PRICE_BPS;
            price += 1
        ) {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 levelSize = yesAskBook[uint8(price)];
            if (levelSize > 0) {
                // forge-lint: disable-next-line(unsafe-typecast)
                askPrices[askSlot] = uint8(price);
                askSizes[askSlot] = levelSize;
                askSlot += 1;
                if (askSlot == uint256(ORDER_BOOK_DEPTH)) {
                    break;
                }
            }
        }
    }

    function positionOf(
        address burner
    )
        external
        view
        returns (
            uint256 yesAmount,
            uint256 noAmount,
            bool alreadyClaimed,
            uint256 claimable
        )
    {
        yesAmount = yesStake[burner];
        noAmount = noStake[burner];
        alreadyClaimed = false;
        claimable = 0;
    }

    function _matchOrder(
        address trader,
        bool side,
        uint8 executionLimitBps,
        uint256 amount
    ) internal returns (uint256 remaining) {
        remaining = amount;

        if (side) {
            for (
                uint256 price = MIN_LIMIT_PRICE_BPS;
                price <= executionLimitBps && remaining > 0;
                price += 1
            ) {
                // forge-lint: disable-next-line(unsafe-typecast)
                remaining = _matchAgainstAskLevel(trader, uint8(price), remaining);
            }
        } else {
            for (
                uint256 price = MAX_LIMIT_PRICE_BPS;
                price >= executionLimitBps && remaining > 0;
                price -= 1
            ) {
                // forge-lint: disable-next-line(unsafe-typecast)
                remaining = _matchAgainstBidLevel(trader, uint8(price), remaining);
                if (price == MIN_LIMIT_PRICE_BPS) {
                    break;
                }
            }
        }
    }

    function _matchAgainstAskLevel(
        address yesTrader,
        uint8 priceBps,
        uint256 remaining
    ) internal returns (uint256) {
        uint64[] storage queue = yesAskOrderIds[priceBps];
        uint256 cursor = yesAskCursor[priceBps];

        while (remaining > 0 && cursor < queue.length) {
            uint64 orderId = queue[cursor];
            LimitOrder storage order = limitOrders[orderId];

            if (!order.active || order.amount == 0) {
                cursor += 1;
                continue;
            }

            uint256 matchedAmount = remaining < order.amount
                ? remaining
                : order.amount;

            order.amount -= matchedAmount;
            yesAskBook[priceBps] -= matchedAmount;
            openNoOrders[order.owner] -= matchedAmount;
            openOrderValue[order.owner] -= matchedAmount;
            remaining -= matchedAmount;

            _openMatchedPosition(yesTrader, order.owner, matchedAmount);

            if (order.amount == 0) {
                order.active = false;
                cursor += 1;
            }
        }

        yesAskCursor[priceBps] = cursor;
        return remaining;
    }

    function _matchAgainstBidLevel(
        address noTrader,
        uint8 priceBps,
        uint256 remaining
    ) internal returns (uint256) {
        uint64[] storage queue = yesBidOrderIds[priceBps];
        uint256 cursor = yesBidCursor[priceBps];

        while (remaining > 0 && cursor < queue.length) {
            uint64 orderId = queue[cursor];
            LimitOrder storage order = limitOrders[orderId];

            if (!order.active || order.amount == 0) {
                cursor += 1;
                continue;
            }

            uint256 matchedAmount = remaining < order.amount
                ? remaining
                : order.amount;

            order.amount -= matchedAmount;
            yesBidBook[priceBps] -= matchedAmount;
            openYesOrders[order.owner] -= matchedAmount;
            openOrderValue[order.owner] -= matchedAmount;
            remaining -= matchedAmount;

            _openMatchedPosition(order.owner, noTrader, matchedAmount);

            if (order.amount == 0) {
                order.active = false;
                cursor += 1;
            }
        }

        yesBidCursor[priceBps] = cursor;
        return remaining;
    }

    function _openMatchedPosition(
        address yesTrader,
        address noTrader,
        uint256 amount
    ) internal {
        _trackParticipant(yesTrader);
        _trackParticipant(noTrader);

        yesStake[yesTrader] += amount;
        noStake[noTrader] += amount;
        yesPool += amount;
        noPool += amount;

        emit PositionOpened(yesTrader, true, amount);
        emit PositionOpened(noTrader, false, amount);
    }

    function _openPosition(
        address trader,
        bool side,
        uint256 amount
    ) internal {
        _requireMarketOpen();

        if (amount == 0) {
            revert InvalidAmount();
        }

        _trackParticipant(trader);

        if (side) {
            yesStake[trader] += amount;
            yesPool += amount;
        } else {
            noStake[trader] += amount;
            noPool += amount;
        }

        emit PositionOpened(trader, side, amount);
    }

    function _trackParticipant(address trader) internal {
        if (!trackedParticipant[trader]) {
            trackedParticipant[trader] = true;
            activeParticipants.push(trader);
        }
    }

    function _clearRestingOrders() internal {
        for (uint256 index = 0; index < activeOrderIds.length; index += 1) {
            uint64 orderId = activeOrderIds[index];
            LimitOrder storage order = limitOrders[orderId];

            if (!order.active || order.amount == 0) {
                continue;
            }

            uint256 refund = order.amount;
            order.active = false;
            order.amount = 0;

            if (order.side) {
                openYesOrders[order.owner] -= refund;
            } else {
                openNoOrders[order.owner] -= refund;
            }
            openOrderValue[order.owner] -= refund;

            _pay(order.owner, refund);
        }
        delete activeOrderIds;

        for (
            uint256 price = MIN_LIMIT_PRICE_BPS;
            price <= MAX_LIMIT_PRICE_BPS;
            price += 1
        ) {
            // forge-lint: disable-next-line(unsafe-typecast)
            uint8 level = uint8(price);
            delete yesBidOrderIds[level];
            delete yesAskOrderIds[level];
            yesBidCursor[level] = 0;
            yesAskCursor[level] = 0;
            yesBidBook[level] = 0;
            yesAskBook[level] = 0;
        }
    }

    function _requireMarketOpen() internal view {
        if (block.timestamp >= cutoffTime) {
            revert MarketClosed();
        }
    }

    function _executionLimit(
        bool side,
        uint8 priceBps,
        uint8 slippageBps
    ) internal pure returns (uint8) {
        if (side) {
            uint256 limit = uint256(priceBps) + uint256(slippageBps);
            if (limit > MAX_LIMIT_PRICE_BPS) {
                return MAX_LIMIT_PRICE_BPS;
            }
            // forge-lint: disable-next-line(unsafe-typecast)
            return uint8(limit);
        }

        if (slippageBps >= priceBps) {
            return MIN_LIMIT_PRICE_BPS;
        }

        return priceBps - slippageBps;
    }

    function _nextCutoffTimestamp(
        uint64 referenceTimestamp
    ) internal pure returns (uint64) {
        uint256 nextCutoff = ((uint256(referenceTimestamp) / MARKET_DURATION) + 1) *
            MARKET_DURATION;

        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(nextCutoff);
    }

    function _pay(address recipient, uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
    }

    function _normalizeToE8(
        PythStructs.Price memory price
    ) internal pure returns (int64) {
        int256 exponent = price.expo;
        int256 normalized = price.price;

        while (exponent < -8) {
            normalized /= 10;
            exponent += 1;
        }

        while (exponent > -8) {
            normalized *= 10;
            exponent -= 1;
        }

        if (
            normalized > int256(type(int64).max) ||
            normalized < int256(type(int64).min)
        ) {
            revert OraclePriceOutOfRange();
        }

        // forge-lint: disable-next-line(unsafe-typecast)
        return int64(normalized);
    }
}
