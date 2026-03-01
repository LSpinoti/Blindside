// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract BinaryPriceMarket {
    error AlreadyClaimed();
    error AlreadyResolved();
    error DirectTransfersDisabled();
    error InvalidAmount();
    error InvalidLimitPrice();
    error MarketClosed();
    error MarketStillOpen();
    error NothingToClaim();
    error NotOrderOwner();
    error OraclePriceOutOfRange();
    error OrderInactive();
    error TransferFailed();
    error UnauthorizedResolver();

    event PositionOpened(address burner, bool side, uint256 amount);
    event MarketResolved(bool outcome, int64 settlementPrice, uint256 resolvedAt);
    event Claimed(address burner, uint256 payout);
    event LimitOrderPlaced(
        uint64 indexed orderId,
        address indexed trader,
        bool side,
        uint8 limitPriceBps,
        uint256 amount
    );
    event LimitOrderCancelled(
        uint64 indexed orderId,
        address indexed trader,
        uint256 refund
    );

    uint8 private constant MIN_LIMIT_PRICE_BPS = 1;
    uint8 private constant MAX_LIMIT_PRICE_BPS = 99;
    uint8 private constant ORDER_BOOK_DEPTH = 4;

    struct LimitOrder {
        address owner;
        bool side;
        uint8 priceBps;
        uint256 amount;
        bool active;
    }

    IPyth public immutable PYTH;
    address public immutable OPERATOR;
    bytes32 public immutable PRICE_FEED_ID;
    string public question;
    int64 public strikeE8;
    uint64 public cutoffTime;

    uint256 public yesPool;
    uint256 public noPool;
    bool public resolved;
    bool public resolvedOutcome;
    int64 public settlementPrice;
    uint256 public resolvedAt;

    mapping(address => uint256) public yesStake;
    mapping(address => uint256) public noStake;
    mapping(address => bool) public claimed;
    mapping(uint64 => LimitOrder) public limitOrders;
    mapping(uint8 => uint256) public yesBidBook;
    mapping(uint8 => uint256) public yesAskBook;
    mapping(address => uint256) public openYesOrders;
    mapping(address => uint256) public openNoOrders;
    mapping(address => uint256) public openOrderValue;

    uint64 public nextOrderId = 1;

    constructor(
        string memory marketQuestion,
        int64 strikePriceE8,
        uint64 marketCutoffTime,
        address pythAddress,
        bytes32 feedId
    ) {
        if (marketCutoffTime <= block.timestamp) {
            revert MarketClosed();
        }

        PYTH = IPyth(pythAddress);
        OPERATOR = msg.sender;
        PRICE_FEED_ID = feedId;
        question = marketQuestion;
        strikeE8 = strikePriceE8;
        cutoffTime = marketCutoffTime;
    }

    receive() external payable {
        revert DirectTransfersDisabled();
    }

    function buyYes() external payable {
        _openPosition(true);
    }

    function buyNo() external payable {
        _openPosition(false);
    }

    function placeLimitOrder(
        bool side,
        uint8 limitPriceBps
    ) external payable returns (uint64 orderId) {
        if (resolved || block.timestamp >= cutoffTime) {
            revert MarketClosed();
        }
        if (msg.value == 0) {
            revert InvalidAmount();
        }
        if (
            limitPriceBps < MIN_LIMIT_PRICE_BPS ||
            limitPriceBps > MAX_LIMIT_PRICE_BPS
        ) {
            revert InvalidLimitPrice();
        }

        orderId = nextOrderId;
        nextOrderId += 1;

        limitOrders[orderId] = LimitOrder({
            owner: msg.sender,
            side: side,
            priceBps: limitPriceBps,
            amount: msg.value,
            active: true
        });

        if (side) {
            yesBidBook[limitPriceBps] += msg.value;
            openYesOrders[msg.sender] += msg.value;
        } else {
            yesAskBook[limitPriceBps] += msg.value;
            openNoOrders[msg.sender] += msg.value;
        }
        openOrderValue[msg.sender] += msg.value;

        emit LimitOrderPlaced(
            orderId,
            msg.sender,
            side,
            limitPriceBps,
            msg.value
        );
    }

    function cancelLimitOrder(uint64 orderId) external {
        LimitOrder storage order = limitOrders[orderId];
        if (!order.active) {
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

        (bool success, ) = payable(msg.sender).call{value: refund}("");
        if (!success) {
            revert TransferFailed();
        }

        emit LimitOrderCancelled(orderId, msg.sender, refund);
    }

    function resolve(bytes[] calldata updateData) external payable {
        if (msg.sender != OPERATOR) {
            revert UnauthorizedResolver();
        }
        if (resolved) {
            revert AlreadyResolved();
        }
        if (block.timestamp < cutoffTime) {
            revert MarketStillOpen();
        }

        uint256 fee = PYTH.getUpdateFee(updateData);
        bytes32[] memory priceIds = new bytes32[](1);
        priceIds[0] = PRICE_FEED_ID;

        PythStructs.PriceFeed[] memory priceFeeds = PYTH.parsePriceFeedUpdatesUnique{
            value: fee
        }(updateData, priceIds, cutoffTime, uint64(block.timestamp));

        int64 normalizedPrice = _normalizeToE8(priceFeeds[0].price);
        if (normalizedPrice <= 0) {
            revert OraclePriceOutOfRange();
        }

        resolved = true;
        settlementPrice = normalizedPrice;
        resolvedOutcome = normalizedPrice > strikeE8;
        resolvedAt = block.timestamp;

        emit MarketResolved(resolvedOutcome, settlementPrice, resolvedAt);

        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            if (!success) {
                revert TransferFailed();
            }
        }
    }

    function claim() external {
        if (!resolved) {
            revert MarketStillOpen();
        }
        if (claimed[msg.sender]) {
            revert AlreadyClaimed();
        }

        uint256 winnerStake = resolvedOutcome
            ? yesStake[msg.sender]
            : noStake[msg.sender];
        uint256 winningPool = resolvedOutcome ? yesPool : noPool;

        if (winnerStake == 0 || winningPool == 0) {
            revert NothingToClaim();
        }

        claimed[msg.sender] = true;

        uint256 payout = (winnerStake * (yesPool + noPool)) / winningPool;
        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) {
            revert TransferFailed();
        }

        emit Claimed(msg.sender, payout);
    }

    function previewPayout(address burner) external view returns (uint256) {
        if (!resolved) {
            return 0;
        }

        uint256 winnerStake = resolvedOutcome ? yesStake[burner] : noStake[burner];
        uint256 winningPool = resolvedOutcome ? yesPool : noPool;

        if (winnerStake == 0 || winningPool == 0 || claimed[burner]) {
            return 0;
        }

        return (winnerStake * (yesPool + noPool)) / winningPool;
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
        for (uint256 price = MIN_LIMIT_PRICE_BPS; price <= MAX_LIMIT_PRICE_BPS; price += 1) {
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
        alreadyClaimed = claimed[burner];

        if (resolved && !alreadyClaimed) {
            uint256 winnerStake = resolvedOutcome ? yesAmount : noAmount;
            uint256 winningPool = resolvedOutcome ? yesPool : noPool;
            if (winnerStake > 0 && winningPool > 0) {
                claimable = (winnerStake * (yesPool + noPool)) / winningPool;
            }
        }
    }

    function _openPosition(bool side) internal {
        if (resolved || block.timestamp >= cutoffTime) {
            revert MarketClosed();
        }
        if (msg.value == 0) {
            revert InvalidAmount();
        }

        if (side) {
            yesStake[msg.sender] += msg.value;
            yesPool += msg.value;
        } else {
            noStake[msg.sender] += msg.value;
            noPool += msg.value;
        }

        emit PositionOpened(msg.sender, side, msg.value);
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
